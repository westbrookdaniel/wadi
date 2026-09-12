import { testDatabase } from './test-database.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from './main.js';

async function start(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
test('Node API preserves auth, profile isolation, lists, progress, addons without cloud video proxying', async t => {
 const { app, db } = createApp({ database: await testDatabase(t), allowPrivateAddons: true });
 const server = createServer(app), base = await start(server);
 t.after(async () => { server.closeAllConnections(); server.close(); await db.close(); });
 const media = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
 const upstream = createServer((req,res) => {
  if (req.url === '/manifest.json' || req.url === '/other/manifest.json') return res.end(JSON.stringify({id:'fixture',name:'Fixture',version:'1',resources:['catalog','meta','stream'],types:['movie'],catalogs:[{id:'test',type:'movie'}]}));
  if (req.url === '/catalog/movie/test.json') return res.end(JSON.stringify({metas:[{id:'test:film',type:'movie',name:'Test film'}]}));
  if (req.url === '/stream/movie/test%3Afilm.json') return res.end(JSON.stringify({streams:[{url:`${fixture}/media.mp4`}]}));
  if (req.url === '/media.mp4') {
   res.setHeader('Content-Type','video/mp4'); res.setHeader('Accept-Ranges','bytes');
   const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
   if(range) { const start=Number(range[1]), end=range[2]?Number(range[2]):media.length-1;
    if(start>=media.length) {res.writeHead(416,{'Content-Range':`bytes */${media.length}`});return res.end();}
    res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${media.length}`,'Content-Length':end-start+1});return res.end(media.subarray(start,end+1));
   } res.setHeader('Content-Length',media.length); return res.end(media);
  } res.writeHead(404);res.end();
 });
 const fixture = await start(upstream); t.after(()=>{upstream.closeAllConnections();upstream.close();});
 let token;
 async function request(path, method='GET', body, expected=200) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text(); assert.equal(response.status,expected,`${method} ${path}: ${text}`);return text?JSON.parse(text):null;
 }
 await request('/api/auth/me','GET',undefined,401);
 const auth=await request('/api/auth/register','POST',{email:'test@example.com',password:'test-password'},201);token=auth.token;
 assert.equal((await request('/api/auth/me')).id,auth.user.id);
 const saved=(await request('/api/lists')).items[0];assert.equal(saved.is_default,true);
 await request(`/api/lists/${saved.id}`,'DELETE',undefined,400);
 await request(`/api/lists/${saved.id}/items`,'POST',{media_type:'movie',media_id:'test:film',title:'Film'},201);
 assert.equal((await request(`/api/lists/${saved.id}/items`)).items.length,1);
 await request('/api/watch-progress','PUT',{media_type:'movie',media_id:'test:film',position_seconds:12,duration_seconds:60});
 assert.equal((await request('/api/continue-watching')).items[0].position_seconds,12);
 const profile=await request('/api/profiles','POST',{name:'Second'},201);
 await request('/api/profiles/select','POST',{profile_id:profile.id});
 await request(`/api/lists/${saved.id}/items`,'GET',undefined,404);
 assert.equal((await request('/api/continue-watching')).items.length,0);
 await request('/api/profiles/select','POST',{profile_id:auth.active_profile_id});
 assert.equal((await request('/api/continue-watching')).items.length,1);
 await request('/api/addons/install','POST',{url:fixture+'/manifest.json'},201);
 const firstAddon = (await request('/api/addons')).items[0];
 await request('/api/addons/install','POST',{url:fixture+'/other/manifest.json'},201);
 const secondAddon = (await request('/api/addons')).items[1];
 await request('/api/addons/order','PUT',{ids:[secondAddon.id,firstAddon.id]});
 assert.deepEqual((await request('/api/addons')).items.map(addon=>addon.id),[secondAddon.id,firstAddon.id]);
 await request('/api/addons/order','PUT',{ids:[firstAddon.id,firstAddon.id]},400);
 await request('/api/addons/order','PUT',{ids:[firstAddon.id,'foreign']},400);
 await request('/api/addons/order','PUT',{ids:[]},400);
 await request(`/api/profiles/${profile.id}`,'PUT',{name:'Second',avatar_key:fixture+'/avatar.png'});
 assert.equal((await request('/api/profiles')).items.find(item=>item.id===profile.id).avatar_key,fixture+'/avatar.png');
 await request(`/api/profiles/${profile.id}`,'PUT',{name:'Second',avatar_key:'javascript:alert(1)'},400);
 const layout = {pages:{home:{order:[],hidden:[],catalogModes:{popular:'series'}},movies:{order:[],hidden:[]},series:{order:[],hidden:[]}}};
 await request('/api/settings/browse-layout','PUT',layout);
 assert.equal((await request('/api/settings/browse-layout')).pages.home.catalogModes.popular,'series');
 assert.equal((await request('/api/catalogs')).items[0].catalog.id,'test');
 assert.equal((await request('/api/catalog/movie/test')).responses[0].response.metas[0].name,'Test film');
 const streams=await request('/api/streams/movie/test%3Afilm');assert.equal(streams.responses[0].response.streams[0].url,fixture+'/media.mp4');
 const proxy=base+'/api/stream-proxy?url='+encodeURIComponent(fixture+'/media.mp4');
 assert.equal((await fetch(proxy,{headers:{Authorization:`Bearer ${token}`}})).status,404);
 assert.equal((await request('/api/server-capabilities')).conversion,false);
 await request('/api/settings/player-defaults','PUT',{playback_speed:1.5});assert.equal((await request('/api/settings/player-defaults')).playback_speed,1.5);
 await request('/api/settings/player-defaults','PUT',{playback_speed:-2},400);
 await request('/api/auth/logout','POST',undefined,204);await request('/api/auth/me','GET',undefined,401);
 const login=await request('/api/auth/login','POST',{email:'test@example.com',password:'test-password'});assert.ok(login.token);
});

test('Postgres accounts and sessions survive a Node server restart', async t => {
 const database=await testDatabase(t);
 let runtime=createApp({database}); let server=createServer(runtime.app);let base=await start(server);
 const auth=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'persist@example.com',password:'persist-password'})}).then(r=>r.json());
 server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));await runtime.db.close();
 runtime=createApp({database});server=createServer(runtime.app);base=await start(server);
 t.after(async()=>{server.closeAllConnections();server.close();await runtime.db.close();});
 const response=await fetch(base+'/api/auth/me',{headers:{Authorization:`Bearer ${auth.token}`}});assert.equal(response.status,200);assert.equal((await response.json()).id,auth.user.id);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'persist@example.com',password:'persist-password'})});assert.equal(login.status,200);
});
