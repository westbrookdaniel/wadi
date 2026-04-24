use std::{collections::BTreeMap, fmt};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use crate::{
    error::{AppError, AppResult},
    stremio::{encode_extra_args, Manifest, ResourceKind},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportKind {
    Http,
    Legacy,
    Ipfs,
}

impl fmt::Display for TransportKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Http => write!(f, "http"),
            Self::Legacy => write!(f, "legacy"),
            Self::Ipfs => write!(f, "ipfs"),
        }
    }
}

impl TransportKind {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "http" => Some(Self::Http),
            "legacy" => Some(Self::Legacy),
            "ipfs" => Some(Self::Ipfs),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResourceRequest {
    pub kind: ResourceKind,
    pub content_type: String,
    pub id: String,
    pub extra_args: BTreeMap<String, String>,
}

#[derive(Clone)]
pub struct AddonClient {
    http: Client,
    ipfs_gateway: String,
}

impl AddonClient {
    pub fn new(http: Client, ipfs_gateway: String) -> Self {
        Self { http, ipfs_gateway }
    }

    pub fn detect_transport(&self, source_url: &str) -> AppResult<TransportKind> {
        let url = Url::parse(source_url)?;
        match url.scheme() {
            "http" | "https" if url.path().trim_end_matches('/').ends_with("/stremio/v1") => {
                Ok(TransportKind::Legacy)
            }
            "http" | "https" => Ok(TransportKind::Http),
            "ipfs" | "ipns" => Ok(TransportKind::Ipfs),
            other => Err(AppError::BadRequest(format!(
                "unsupported addon URL scheme '{other}'"
            ))),
        }
    }

    pub async fn fetch_manifest(&self, source_url: &str) -> AppResult<(TransportKind, Manifest, Value)> {
        let transport = self.detect_transport(source_url)?;
        let manifest_url = self.manifest_url(source_url, transport)?;
        let response = self
            .http
            .get(manifest_url)
            .send()
            .await?
            .error_for_status()
            .map_err(|err| AppError::Upstream(err.to_string()))?;
        let manifest_json: Value = response.json().await?;
        let manifest: Manifest = serde_json::from_value(manifest_json.clone())?;
        manifest.validate().map_err(AppError::BadRequest)?;
        Ok((transport, manifest, manifest_json))
    }

    pub async fn fetch_resource(
        &self,
        source_url: &str,
        transport: TransportKind,
        request: ResourceRequest,
        config: Option<Value>,
    ) -> AppResult<Value> {
        let resource_url = self.resource_url(source_url, transport, &request)?;
        let mut builder = self.http.get(resource_url);
        if let Some(config) = config {
            builder = builder.query(&[("config", config.to_string())]);
        }
        let response = builder
            .send()
            .await?
            .error_for_status()
            .map_err(|err| AppError::Upstream(err.to_string()))?;
        Ok(response.json().await?)
    }

    pub fn manifest_url(&self, source_url: &str, transport: TransportKind) -> AppResult<Url> {
        match transport {
            TransportKind::Http => {
                let mut url = Url::parse(source_url)?;
                let path = url.path().trim_end_matches('/').to_string();
                if !path.ends_with("/manifest.json") && path != "/manifest.json" {
                    url.set_path(&format!("{path}/manifest.json"));
                }
                Ok(url)
            }
            TransportKind::Legacy => {
                let mut url = Url::parse(source_url)?;
                let path = url.path().trim_end_matches('/');
                url.set_path(&format!("{path}/manifest.json"));
                Ok(url)
            }
            TransportKind::Ipfs => self.ipfs_gateway_url(source_url, "manifest.json"),
        }
    }

    pub fn resource_url(
        &self,
        source_url: &str,
        transport: TransportKind,
        request: &ResourceRequest,
    ) -> AppResult<Url> {
        match transport {
            TransportKind::Http => {
                let mut url = self.base_http_url(source_url)?;
                let base_path = url.path().trim_end_matches('/');
                let extra = encode_extra_args(&request.extra_args);
                let suffix = match extra {
                    Some(extra) => format!(
                        "{}/{}/{}/{}.json",
                        request.kind.as_stremio(),
                        request.content_type,
                        request.id,
                        extra
                    ),
                    None => format!(
                        "{}/{}/{}.json",
                        request.kind.as_stremio(),
                        request.content_type,
                        request.id
                    ),
                };
                url.set_path(&format!("{base_path}/{suffix}"));
                Ok(url)
            }
            TransportKind::Legacy => {
                let mut url = Url::parse(source_url)?;
                let base_path = url.path().trim_end_matches('/');
                url.set_path(&format!(
                    "{}/{}/{}/{}.json",
                    base_path,
                    request.kind.as_stremio(),
                    request.content_type,
                    request.id
                ));
                if !request.extra_args.is_empty() {
                    url.query_pairs_mut()
                        .extend_pairs(request.extra_args.iter().map(|(k, v)| (&**k, &**v)));
                }
                Ok(url)
            }
            TransportKind::Ipfs => {
                let extra = encode_extra_args(&request.extra_args);
                let relative = match extra {
                    Some(extra) => format!(
                        "{}/{}/{}/{}.json",
                        request.kind.as_stremio(),
                        request.content_type,
                        request.id,
                        extra
                    ),
                    None => format!(
                        "{}/{}/{}.json",
                        request.kind.as_stremio(),
                        request.content_type,
                        request.id
                    ),
                };
                self.ipfs_gateway_url(source_url, &relative)
            }
        }
    }

    fn base_http_url(&self, source_url: &str) -> AppResult<Url> {
        let mut url = Url::parse(source_url)?;
        let path = url.path().trim_end_matches('/').to_string();
        if path.ends_with("/manifest.json") {
            let base = path.trim_end_matches("/manifest.json");
            url.set_path(base);
        }
        Ok(url)
    }

    fn ipfs_gateway_url(&self, source_url: &str, relative: &str) -> AppResult<Url> {
        let source = Url::parse(source_url)?;
        let namespace = match source.scheme() {
            "ipfs" => "ipfs",
            "ipns" => "ipns",
            _ => {
                return Err(AppError::BadRequest(
                    "IPFS transport requires ipfs:// or ipns:// URL".into(),
                ))
            }
        };
        let root = source
            .host_str()
            .ok_or_else(|| AppError::BadRequest("IPFS URL must include a content id".into()))?;
        let path = source.path().trim_start_matches('/').trim_end_matches('/');
        let mut gateway = Url::parse(self.ipfs_gateway.trim_end_matches('/'))?;
        let mut full_path = format!("/{namespace}/{root}");
        if !path.is_empty() {
            full_path.push('/');
            full_path.push_str(path);
        }
        full_path.push('/');
        full_path.push_str(relative.trim_start_matches('/'));
        gateway.set_path(&full_path);
        Ok(gateway)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> AddonClient {
        AddonClient::new(Client::new(), "https://gateway.example".into())
    }

    #[test]
    fn detects_transports() {
        let client = client();
        assert_eq!(
            client.detect_transport("https://example.com/manifest.json").unwrap(),
            TransportKind::Http
        );
        assert_eq!(
            client.detect_transport("https://example.com/stremio/v1").unwrap(),
            TransportKind::Legacy
        );
        assert_eq!(
            client.detect_transport("ipfs://bafy/manifest.json").unwrap(),
            TransportKind::Ipfs
        );
    }

    #[test]
    fn builds_http_resource_urls() {
        let client = client();
        let mut extra_args = BTreeMap::new();
        extra_args.insert("search".into(), "alien".into());
        let url = client
            .resource_url(
                "https://addon.example/manifest.json",
                TransportKind::Http,
                &ResourceRequest {
                    kind: ResourceKind::Catalog,
                    content_type: "movie".into(),
                    id: "top".into(),
                    extra_args,
                },
            )
            .unwrap();

        assert_eq!(
            url.as_str(),
            "https://addon.example/catalog/movie/top/search=alien.json"
        );
    }

    #[test]
    fn maps_ipfs_to_gateway() {
        let client = client();
        let url = client
            .manifest_url("ipfs://bafybeifoo", TransportKind::Ipfs)
            .unwrap();
        assert_eq!(url.as_str(), "https://gateway.example/ipfs/bafybeifoo/manifest.json");
    }
}
