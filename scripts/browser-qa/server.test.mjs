import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureServer } from './server.mjs';

async function withServer(run) {
  const server = createFixtureServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('unexpected API calls fail and remain visible in smoke evidence', () => withServer(async origin => {
  assert.equal((await fetch(origin+'/api/typo')).status,501);
  assert.deepEqual((await (await fetch(origin+'/qa/state')).json()).unexpected,[{path:'/api/typo',method:'GET'}]);
  const streams = await (await fetch(origin+'/api/streams/movie/qa-film')).json();
  assert.equal(streams.responses[0].response.streams.length,2);
  assert.match(streams.responses[0].response.streams[1].url,/token=synthetic-only&source=2$/);
}));
test('held response retains its failure snapshot until explicitly released', () => withServer(async origin => {
  const control = body => fetch(origin+'/qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  await control({rules:{'/french.srt':{hold:true,status:503}}});
  const response = fetch(origin+'/french.srt');
  for(let i=0;i<50;i++) { if((await (await fetch(origin+'/qa/state')).json()).pending.includes('/french.srt')) break; await new Promise(resolve => setTimeout(resolve,10)); }
  assert.deepEqual((await (await fetch(origin+'/qa/state')).json()).pending,['/french.srt']);
  await control({rules:{'/french.srt':{}},release:'/french.srt'});
  assert.equal((await response).status,503);
  assert.deepEqual((await (await fetch(origin+'/qa/state')).json()).pending,[]);
}));

test('wrong method and invalid progress fail the fixture contract', () => withServer(async origin => {
  assert.equal((await fetch(origin+'/api/meta/movie/qa-film',{method:'POST'})).status,400);
  assert.equal((await fetch(origin+'/api/watch-progress',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({position_seconds:-1})})).status,400);
  assert.equal((await (await fetch(origin+'/qa/state')).json()).unexpected.length,2);
}));

test('real PUT progress commits are retained for persistence assertions', () => withServer(async origin => {
  const body={media_type:'movie',media_id:'qa-film',video_id:null,position_seconds:65,duration_seconds:120};
  assert.equal((await fetch(origin+'/api/watch-progress',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status,200);
  const state=await (await fetch(origin+'/qa/state')).json();assert.equal(state.watch.position_seconds,65);assert.equal(state.writes.length,1);assert.deepEqual(state.unexpected,[]);
}));

test('title and episode fixtures use distinct playable URLs and isolate saved progress', () => withServer(async origin => {
  const paths=['movie/qa-film','movie/qa-film-b','series/qa-episode-1','series/qa-episode-2'];
  const urls=[];
  for(const path of paths){const value=await (await fetch(origin+'/api/streams/'+path)).json();urls.push(...value.responses[0].response.streams.map(stream=>stream.url));}
  assert.equal(new Set(urls).size,8);
  const catalog=await (await fetch(origin+'/api/episodes/series/qa-show')).json();assert.equal(catalog.items.length,2);assert.deepEqual(catalog.items.map(item=>item.videoIds),[['qa-episode-1'],['qa-episode-2']]);
  const body={media_type:'series',media_id:'qa-show',video_id:'qa-episode-2',position_seconds:23,duration_seconds:120};
  assert.equal((await fetch(origin+'/api/watch-progress',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status,200);
  const show=await (await fetch(origin+'/api/watch-data/series/qa-show')).json();assert.equal(show.items.find(item=>item.video_id==='qa-episode-2').position_seconds,23);assert.equal(show.items.find(item=>item.video_id==='qa-episode-1').position_seconds,15);
  const film=await (await fetch(origin+'/api/watch-data/movie/qa-film')).json();assert.equal(film.items[0].position_seconds,60);
  const state=await (await fetch(origin+'/qa/state')).json();assert.equal(state.writes[0].video_id,'qa-episode-2');assert.deepEqual(state.unexpected,[]);
}));

test('empty/unavailable streams remain target-specific and held responses retain their snapshot', () => withServer(async origin => {
  const control=body=>fetch(origin+'/qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const path='/api/streams/series/qa-episode-1';await control({rules:{[path]:{hold:true,empty:true}}});
  const pending=fetch(origin+path);
  for(let i=0;i<50;i++){if((await (await fetch(origin+'/qa/state')).json()).pending.includes(path))break;await new Promise(resolve=>setTimeout(resolve,10));}
  await control({rules:{[path]:{unavailable:true}},release:path});
  assert.deepEqual((await (await pending).json()).responses[0].response.streams,[]);
  assert.equal((await (await fetch(origin+path)).json()).responses[0].response.streams[0].url,'');
  assert.equal((await (await fetch(origin+'/api/streams/series/qa-episode-2')).json()).responses[0].response.streams.length,2);
}));
