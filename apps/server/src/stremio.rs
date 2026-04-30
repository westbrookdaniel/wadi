use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use url::form_urlencoded;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub resources: Vec<ResourceDecl>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default, rename = "idPrefixes")]
    pub id_prefixes: Vec<String>,
    #[serde(default)]
    pub catalogs: Vec<CatalogDecl>,
    #[serde(default, rename = "addonCatalogs")]
    pub addon_catalogs: Vec<CatalogDecl>,
    #[serde(default)]
    pub config: Vec<ConfigDecl>,
    #[serde(default, rename = "behaviorHints")]
    pub behavior_hints: Option<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResourceDecl {
    Name(String),
    Object {
        name: String,
        #[serde(default)]
        types: Vec<String>,
        #[serde(default, rename = "idPrefixes")]
        id_prefixes: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogDecl {
    #[serde(rename = "type")]
    pub content_type: String,
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub extra: Vec<CatalogExtraDecl>,
    #[serde(flatten)]
    pub other: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogExtraDecl {
    pub name: String,
    #[serde(default, rename = "isRequired")]
    pub is_required: bool,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default, rename = "optionsLimit")]
    pub options_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigDecl {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub default: Option<Value>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResourceKind {
    Catalog,
    Meta,
    Stream,
    Subtitles,
    AddonCatalog,
}

impl ResourceKind {
    pub fn as_stremio(self) -> &'static str {
        match self {
            Self::Catalog => "catalog",
            Self::Meta => "meta",
            Self::Stream => "stream",
            Self::Subtitles => "subtitles",
            Self::AddonCatalog => "addon_catalog",
        }
    }
}

impl Manifest {
    pub fn supports_resource(
        &self,
        kind: ResourceKind,
        content_type: &str,
        id: Option<&str>,
    ) -> bool {
        if kind == ResourceKind::Catalog {
            return self
                .catalogs
                .iter()
                .any(|catalog| catalog.content_type == content_type);
        }

        self.resources.iter().any(|resource| match resource {
            ResourceDecl::Name(name) => {
                name == kind.as_stremio()
                    && self.types.iter().any(|kind_type| kind_type == content_type)
                    && id_matches(&self.id_prefixes, id)
            }
            ResourceDecl::Object {
                name,
                types,
                id_prefixes,
            } => {
                name == kind.as_stremio()
                    && types.iter().any(|kind_type| kind_type == content_type)
                    && id_matches(id_prefixes, id)
            }
        })
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("manifest id is required".into());
        }
        if self.name.trim().is_empty() {
            return Err("manifest name is required".into());
        }
        if self.version.trim().is_empty() {
            return Err("manifest version is required".into());
        }
        if self.resources.is_empty() {
            return Err("manifest must declare at least one resource".into());
        }
        Ok(())
    }
}

pub fn encode_extra_args(args: &BTreeMap<String, String>) -> Option<String> {
    if args.is_empty() {
        return None;
    }

    let mut serializer = form_urlencoded::Serializer::new(String::new());
    for (key, value) in args {
        if !value.is_empty() {
            serializer.append_pair(key, value);
        }
    }
    let encoded = serializer.finish();
    (!encoded.is_empty()).then_some(encoded)
}

fn id_matches(prefixes: &[String], id: Option<&str>) -> bool {
    if prefixes.is_empty() {
        return true;
    }

    id.is_some_and(|value| prefixes.iter().any(|prefix| value.starts_with(prefix)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_resources_by_type_and_id_prefix() {
        let manifest: Manifest = serde_json::from_value(serde_json::json!({
            "id": "org.test",
            "name": "Test",
            "version": "1.0.0",
            "types": ["movie"],
            "resources": [{ "name": "stream", "types": ["movie"], "idPrefixes": ["tt"] }],
            "catalogs": []
        }))
        .unwrap();

        assert!(manifest.supports_resource(ResourceKind::Stream, "movie", Some("tt123")));
        assert!(!manifest.supports_resource(ResourceKind::Stream, "movie", Some("nm123")));
        assert!(!manifest.supports_resource(ResourceKind::Stream, "series", Some("tt123")));
    }

    #[test]
    fn encodes_extra_args_as_stremio_path_segment() {
        let mut args = BTreeMap::new();
        args.insert("search".to_string(), "game of thrones".to_string());
        args.insert("skip".to_string(), "100".to_string());

        assert_eq!(
            encode_extra_args(&args).unwrap(),
            "search=game+of+thrones&skip=100"
        );
    }
}
