import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdates, newerVersion, releaseDownload } from './updates.mjs';
const repository = 'westbrookdaniel/wadi';
const release = { tag_name: 'v0.2.0', assets: [{ name:'Wadi-0.2.0-mac-arm64.dmg', browser_download_url:'https://github.com/westbrookdaniel/wadi/releases/download/v0.2.0/Wadi-0.2.0-mac-arm64.dmg' }] };
test('checks metadata but opens downloads only when requested', async t => {
  const opened = [], states = [];
  const service = createUpdates({ repository, currentVersion:'0.1.1', platform:'darwin', arch:'arm64', enabled:true, notify:s=>states.push(s), feedback:async()=>{}, openDownload:async url=>opened.push(url), fetchRelease:async()=>release });
  t.after(()=>service.dispose());
  await service.check(); assert.equal(service.state().kind,'available'); assert.equal(opened.length,0);
  await service.download(); assert.deepEqual(opened,[release.assets[0].browser_download_url]);
});
test('never downgrades or accepts prerelease version strings',()=>{
  assert.equal(newerVersion('v0.10.0','0.9.0'),true);
  for(const version of ['v0.1.1','v0.1.0','v1.0.0-beta','garbage'])assert.equal(newerVersion(version,'0.1.1'),false);
});
test('untrusted asset links and unavailable architectures fall back to GitHub release page',()=>{
  const fallback='https://github.com/westbrookdaniel/wadi/releases/latest';
  assert.equal(releaseDownload(release,repository,'darwin','x64'),fallback);
  assert.equal(releaseDownload({...release,assets:[{...release.assets[0],browser_download_url:'https://evil.example/installer'}]},repository,'darwin','arm64'),fallback);
});
test('failed checks can be retried',async t=>{
  let fail=true;
  const service=createUpdates({repository,currentVersion:'0.1.1',platform:'darwin',arch:'arm64',enabled:true,notify:()=>{},feedback:async()=>{},openDownload:async()=>{},fetchRelease:async()=>{if(fail)throw Error();return release;}});
  t.after(()=>service.dispose());await service.check();assert.equal(service.state().kind,'error');fail=false;await service.check();assert.equal(service.state().kind,'available');
});
