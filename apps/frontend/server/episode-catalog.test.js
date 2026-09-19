import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from './main.js';
import { testDatabase } from './test-database.js';
async function listen(server) {server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;}
test('episode catalog refresh, outage fallback, provider removal and profile isolation', async t => {
  let code, requests=0, failing=false;
  const {app,db}=createApp({database:await testDatabase(t),allowPrivateAddons:true,sendVerificationEmail:async value=>{code=value.code;}});
  const server=createServer(app),base=await listen(server);
  t.after(async()=>{server.closeAllConnections();server.close();await db.close();});
  const provider=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url.endsWith('/manifest.json'))return res.end(JSON.stringify({id:'episodes',name:'Episodes',version:'1',resources:['meta'],types:['series'],catalogs:[]}));
    requests++;if(failing){res.writeHead(503);return res.end('{}');}
    const prefix=req.url.startsWith('/b/')?'b':'a';
    res.end(JSON.stringify({meta:{id:'show',videos:[{id:prefix+':1',season:1,episode:1,title:'Pilot',released:'2026-01-01'}]}}));
  });const upstream=await listen(provider);t.after(()=>{provider.closeAllConnections();provider.close();});
  let token;
  async function request(path,method='GET',body,status=200){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});assert.equal(response.status,status);return response.status===204?null:response.json();}
  const pending=await request('/api/auth/register','POST',{email:'episode@example.com',password:'local-episode-test'},202);
  const auth=await request('/api/auth/verify-email','POST',{challenge:pending.challenge,code});token=auth.token;
  const a=await request('/api/addons/install','POST',{url:upstream+'/a/manifest.json'},201);
  await request('/api/addons/install','POST',{url:upstream+'/b/manifest.json'},201);
  const first=await request('/api/episodes/series/show');assert.equal(first.items.length,1);assert.deepEqual(first.items[0].videoIds,['a:1','b:1']);assert.equal(requests,2);
  await request('/api/episodes/series/show');assert.equal(requests,2,'fresh metadata is cached');
  await request('/api/watch-state','PUT',{media_type:'series',media_id:'show',video_id:'b:1',watched:true});
  assert.equal((await request('/api/episodes/series/show')).items[0].watched,true);
  const profile=await request('/api/profiles','POST',{name:'Second',avatar_key:'avatar-2'},201);
  await request('/api/profiles/select','POST',{profile_id:profile.id});
  assert.equal((await request('/api/episodes/series/show')).items[0].watched,false);
  await db.run("UPDATE episode_catalogs SET fetched_at='2000-01-01T00:00:00Z'");failing=true;
  const stale=await request('/api/episodes/series/show');assert.equal(stale.stale,true);assert.equal(stale.items.length,1);assert.equal(stale.sources.length,2);
  await request('/api/addons/'+a.id,'DELETE',undefined,204);
  const removed=await request('/api/episodes/series/show');assert.deepEqual(removed.items[0].videoIds,['b:1']);
  await request('/api/episodes/movie/show','GET',undefined,400);
});
