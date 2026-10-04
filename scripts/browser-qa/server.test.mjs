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
  assert.equal((await fetch(origin+'/api/watch-progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({position_seconds:-1})})).status,400);
  assert.equal((await (await fetch(origin+'/qa/state')).json()).unexpected.length,2);
}));
