import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
  }
  // Global unicast only; excludes loopback, link-local, ULA and mapped IPv4.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}
async function requestAddonJson(source, { allowPrivate = false } = {}) {
  let url = new URL(source);
  const deadline = AbortSignal.timeout(15000);
  for (let redirects=0; redirects<5; redirects++) {
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid addon URL');
    const host = url.hostname.replace(/^\[|\]$/g,'');
    if (!allowPrivate && isIP(host) && !publicAddress(host)) throw new Error('Addon must use a public address');
    const result = await new Promise((resolve,reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.get(url, {
        signal: deadline,
        headers: {'User-Agent':'wadi-server/0.3','Accept':'application/json'},
        lookup(hostname, options, callback) {
          lookup(hostname,{all:true},(error,addresses)=>{
            if(error)return callback(error);
            if(!addresses.length || !allowPrivate && addresses.some(item=>!publicAddress(item.address)))return callback(new Error('Addon must use a public address'));
            if(options.all) callback(null,addresses);
            else callback(null,addresses[0].address,addresses[0].family);
          });
        },
      }, response => {
        if([301,302,303,307,308].includes(response.statusCode) && response.headers.location) { response.resume();resolve({redirect:response.headers.location});return; }
        if(response.statusCode!==200){response.resume();reject(new Error(`Addon returned HTTP ${response.statusCode}`));return;}
        if(response.headers['content-type'] && !/json/i.test(response.headers['content-type'])) {response.destroy();reject(new Error('Addon did not return JSON'));return;}
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>3*1024*1024){response.destroy();reject(new Error('Addon response exceeds 3 MB'));}else chunks.push(chunk);});
        response.on('error',reject);
        response.on('end',()=>{try{resolve({value:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(new Error('Invalid addon JSON'));}});
      });
      request.on('error',reject);
    });
    if('value' in result)return result.value;
    url=new URL(result.redirect,url);
  }
  throw new Error('Too many addon redirects');
}

// Never expose configured paths: addon URLs can contain provider credentials.
export async function fetchAddonJson(source, options) {
  try { return await requestAddonJson(source, options); }
  catch (error) {
    const host = new URL(source).hostname;
    const upstreamStatus = /^Addon returned HTTP (\d+)$/.exec(error.message)?.[1];
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined;
    console.warn('Addon request failed', { host, upstreamStatus, code });
    const message = upstreamStatus
      ? `The addon provider (${host}) returned HTTP ${upstreamStatus}. Please try again later or check the addon URL.`
      : error.name === 'AbortError'
        ? `The addon provider (${host}) took too long to respond. Please try again.`
        : ['Addon must use a public address', 'Invalid addon URL', 'Addon did not return JSON', 'Invalid addon JSON', 'Addon response exceeds 3 MB', 'Too many addon redirects'].includes(error.message)
          ? error.message
          : `Could not connect to the addon provider (${host}). Please try again later.`;
    throw Object.assign(new Error(message), { status: 502, code: 'ADDON_PROVIDER_ERROR' });
  }
}
