// CI-only real GUI smoke. Local physical runs must use the assigned QA slot.
import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { observeWebAudio, observeNativeAudio, readFrequency } from './audio-probe.mjs';
import { classifyNativeErrors } from './native-errors.mjs';

const [engine, bundleArgument, executable] = process.argv.slice(2);
if (!['web','native'].includes(engine) || !bundleArgument || engine === 'native' && (!executable || process.platform !== 'darwin' || process.arch !== 'arm64')) throw new Error('Usage: node scripts/player-smoke/run.mjs web <web-bundle> | native <native-bundle> <sealed-arm64-app-executable>');
const bundle = resolve(bundleArgument), output = resolve('player-smoke-results',engine);
await mkdir(output,{recursive:true});
const started = Date.now(), revision = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const evidence = {engine,revision,platform:process.platform,arch:process.arch,fixture:'tones-v2-440-880-660',started:new Date().toISOString(),phases:[],console:[],pageErrors:[],network:[],samples:[],limitations:['decoded audio graph is not physical speakers','synthetic authentication/API only','native OS write-denial injection is not physical OS denial']};
const owned = [], ownedPorts = [];
let browser, context, page, isolated, passive;
const save = () => writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2));
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function waitUntil(fn, timeout=15000) {
  const end = Date.now()+timeout;
  while(Date.now()<end) { const value = await fn(); if(value) return value; await sleep(100); }
  throw new Error('Timed out waiting for owned runtime/fixture');
}
async function freePort(preferred=0) {
  const server = createServer();
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(preferred,'127.0.0.1',resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function start(command,args,env={}) {
  const child = spawn(command,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  owned.push(child);
  const chunks=[];
  for(const stream of [child.stdout,child.stderr]) {
    let pending='';
    const record=text=>{
      if(!text)return;
      evidence.processEvents ??= [];evidence.processEvents.push({at:Date.now(),phase:evidence.phases.at(-1)?.name,text});
      const match=text.match(/"isolated":"([^"\n]+)"/);if(match)isolated=match[1];
    };
    stream.on('data',chunk=>{
      chunks.push(chunk.toString());appendFileSync(join(output,`process-${child.pid}.log`),chunk);
      pending+=chunk.toString();const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)record(line);
    });
    stream.on('end',()=>record(pending));
  }
  child.on('error',error=>chunks.push(String(error)));
  child.closed=false;child.once('close',()=>{child.closed=true;});
  child.log = chunks;
  return child;
}
function nativeErrors() {
  const result=classifyNativeErrors(evidence.processEvents||[],evidence.navigationWindows);
  evidence.navigationDiagnostics=result.diagnostics;evidence.cancelledSessions=result.cancellations;
  return result.errors;
}
async function phase(name,run) {
  const stamp = Date.now(), entry={name}; evidence.phases.push(entry);
  console.log(`START ${engine}: ${name}`);
  try { await run(); entry.result='pass'; await page.screenshot({path:join(output,`${evidence.phases.length}.png`)}); }
  catch(error) { entry.result='fail';entry.error=error.stack;throw error; }
  finally { entry.seconds=(Date.now()-stamp)/1000;await save(); }
}
try {
  expect((await readFile(join(bundle,'REVISION'),'utf8')).trim()).toBe(revision);
  // Verify the source handoff before either server or app is executed.
  for(const line of (await readFile(join(bundle,'SHA256SUMS'),'utf8')).trim().split('\n')) {
    const [hash,name]=line.split('  ');
    expect(createHash('sha256').update(await readFile(join(bundle,name))).digest('hex')).toBe(hash);
  }
  const port = await freePort(engine==='native'?4173:0), origin=`http://127.0.0.1:${port}`;
  ownedPorts.push(port);
  const fixture = start(process.execPath,[join(bundle,engine==='native'?'fixtures/server.mjs':'server.mjs')],{PORT:String(port)});
  await waitUntil(async()=> {if(fixture.exitCode!==null||fixture.signalCode!==null) throw new Error(fixture.log.join(''));try{return (await fetch(origin+'/qa/state')).ok;}catch{return false;}});
  const state = async()=> (await fetch(origin+'/qa/state')).json();
  const control = async body => {const response=await fetch(origin+'/qa/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});expect(response.ok).toBe(true);};
  if(engine==='native') {
    const appRoot=resolve(executable,'../../..');
    evidence.sealedIdentity=JSON.parse(execFileSync(process.execPath,['scripts/player-smoke/verify-candidate.mjs',appRoot,bundle],{encoding:'utf8'}));
    const cdp=await freePort();ownedPorts.push(cdp);
    const app=start(resolve(executable),[],{WADI_QA_CDP_PORT:String(cdp)});
    await waitUntil(async()=>{if(app.exitCode!==null||app.signalCode!==null)throw new Error(app.log.join(''));try{return (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok;}catch{return false;}},30000);
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
    context=browser.contexts()[0];
    page=await waitUntil(()=>context.pages().find(p=>p.url().startsWith('wadi://app/')));
    // macOS OS clipboard stays behind real UI/production IPC. No read bridge.
  } else {
    browser=await chromium.launch();
    context=await browser.newContext({viewport:{width:1280,height:800},permissions:['clipboard-read','clipboard-write']});
    await context.addInitScript(observeWebAudio);
    page=await context.newPage();
  }
  page.setDefaultTimeout(15000);
  // Playwright evaluate uses userGesture:true. Observations and the negative
  // activation check must not manufacture or refresh a user gesture.
  const session=await context.newCDPSession(page);
  passive=async(fn,arg)=>{
    const result=await session.send('Runtime.evaluate',{expression:`(${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})`,awaitPromise:true,returnByValue:true,userGesture:false});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  if(engine==='native')expect(await passive(()=>Boolean(window.wadiDesktop?.media && window.wadiDesktop?.copyStreamLink))).toBe(true);
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  page.on('pageerror',error=>evidence.pageErrors.push({at:Date.now(),error:String(error),stack:error.stack}));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))evidence.console.push({at:Date.now(),type:message.type(),phase:evidence.phases.at(-1)?.name,text:message.text()});});
  page.on('requestfailed',request=>evidence.network.push({at:Date.now(),url:request.url(),error:request.failure()?.errorText}));
  const reveal=async()=>{await page.mouse.move(300,250);await page.mouse.move(310,250);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const seek=page.getByRole('slider',{name:'Seek Synthetic QA film',exact:true});
  const mediaProperties=()=>passive(()=>{const video=document.querySelector('video');if(video)return {volume:video.volume,muted:video.muted,speed:video.playbackRate};const analyser=globalThis.__wadiAudioProbe?.probes.find(a=>a.context.state!=='closed');return {gain:analyser?.__wadiOutputNode?.gain?.value};});
  const position=async()=>Number(await seek.getAttribute('aria-valuenow'));
  const attachNative=async()=>{await expect(page.getByRole('status',{name:'Loading stream',exact:true})).toBeHidden();await reveal();if(await button('Pause').count())await button('Pause').click();await passive(observeNativeAudio);await button('Play').click();await expect(button('Pause')).toBeEnabled();await expect(page.getByRole('status',{name:'Loading stream',exact:true})).toBeHidden();};
  const startPlaying=async()=>{await reveal();if(await button('Play').count())await button('Play').click();await expect(button('Pause')).toBeEnabled();await expect(page.getByRole('status',{name:'Loading stream',exact:true})).toBeHidden();};
  async function frequency(expected) {
    let consecutive=0;
    await expect.poll(async()=>{
      const sample=await passive(readFrequency);evidence.samples.push({at:Date.now(),expected,...sample});
      consecutive=sample.db>-70&&Math.abs(sample.hz-expected)<20?consecutive+1:0;return consecutive;
    },{timeout:15000,intervals:[100,200,300]}).toBeGreaterThanOrEqual(3);
  }
  const option=(kind,name)=>page.getByRole('menu',{name:kind,exact:true}).getByRole(name.source.startsWith('^Default')?'menuitem':'menuitemradio',{name});
  async function audio(name,hz,playing=true) {
    await reveal();await button('Audio track').click();await option('Audio tracks',name).click();
    await expect(page.getByRole('menu',{name:'Audio tracks',exact:true})).toBeHidden();
    await reveal();await button('Audio track').click();// Default is an action; the resolved first stream remains checked.
    await expect(option('Audio tracks',name.source.startsWith('^Default')?/^English.*440/:name)).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');
    await expect(button('Audio track')).toBeFocused();
    await expect(page.getByRole('status',{name:'Loading stream',exact:true})).toBeHidden();
    if(playing) await frequency(hz);
  }
  async function subtitle(name,text) {
    await reveal();await button('Subtitles').click();await option('Subtitles',name).click();await page.keyboard.press('Escape');
    if(text) await expect(page.getByText(text,{exact:true})).toBeVisible();
    else {for(const caption of ['ENGLISH QA CAPTION','FRENCH QA CAPTION','ALTERNATE ENGLISH QA CAPTION'])await expect(page.getByText(caption,{exact:true})).toBeHidden();}
    await reveal();await button('Subtitles').click();await expect(option('Subtitles',name)).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');
  }
  const clipboard = async()=> engine==='native'?execFileSync('/usr/bin/pbpaste',{encoding:'utf8'}):passive(()=>navigator.clipboard.readText());
  const source=id=>`${origin}/multitrack.webm?token=synthetic-only&source=${id}`;
  await phase('production player starts synthetic resume with decoded English',async()=>{
    if(engine==='web')await page.goto(origin+'/qa/bootstrap?tracks=1');
    await expect(seek).toHaveAttribute('aria-disabled','false');await startPlaying();
    if(engine==='native')await attachNative();
    await frequency(440);expect(await position()).toBeGreaterThanOrEqual(59);expect(await position()).toBeLessThan(75);
  });
  await phase('repeated pointer choices update menu AND decoded output',async()=>{
    const before=await position();
    await audio(/^Japanese/,880);await audio(/^English.*440/,440);await audio(/^English.*alternate/,660);await audio(/^Default audio/,440);await audio(/^Japanese/,880);await audio(/^Default audio/,440);
    expect(await position()).toBeGreaterThanOrEqual(before-1);
  });
  await phase('pause seek switch retains position volume mute speed and resumes chosen output',async()=>{
    await reveal();await button('Pause').click();
    const box=await seek.boundingBox();await seek.click({position:{x:box.width*65/120,y:box.height/2}});
    await expect.poll(position).toBe(65);
    const volume=page.getByRole('slider',{name:'Volume',exact:true});
    await volume.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    const selectedVolume=await mediaProperties();
    expect(engine==='native'?selectedVolume.volume:selectedVolume.gain).toBeGreaterThan(0);
    await button('Playback speed').click();await button('1.25x').click();
    await button('Mute').click();
    await audio(/^Japanese/,880,false);
    await expect(button('Play')).toBeEnabled();await expect(button('Unmute')).toBeVisible();await expect.poll(position).toBe(65);await expect(button('Playback speed')).toContainText('1.25x');if(engine==='native')expect(await mediaProperties()).toMatchObject({muted:true,speed:1.25});
    await button('Unmute').click();await expect.poll(mediaProperties).toMatchObject(engine==='native'?{volume:selectedVolume.volume,muted:false,speed:1.25}:{gain:selectedVolume.gain});await startPlaying();
    // Preservation is proved above. Restore normal volume and speed through
    // the UI before measuring decoded output at the fixed amplitude floor.
    await volume.focus();await page.keyboard.press('End');
    await button('Playback speed').click();await button('1x').click();await frequency(880);
  });
  await phase('real captions repeated language alternative off on and keyboard close',async()=>{
    await subtitle(/^French/,'FRENCH QA CAPTION');await subtitle(/^English.*Stream · 2|^English.*Stream 2/,'ENGLISH QA CAPTION');
    await subtitle(/^English.*Stream · 1|^English.*Stream 1/,'ALTERNATE ENGLISH QA CAPTION');await subtitle(/^No subtitles/,null);await subtitle(/^French/,'FRENCH QA CAPTION');
    await reveal();await button('Audio track').click();await page.keyboard.press('Home');await expect(option('Audio tracks',/^Default audio/)).toBeFocused();await page.keyboard.press('End');await expect(option('Audio tracks',/^English.*alternate/)).toBeFocused();await page.keyboard.press('Escape');await expect(button('Audio track')).toBeFocused();
    await button('Audio track').click();await page.mouse.click(600,200);await expect(page.getByRole('menu',{name:'Audio tracks',exact:true})).toBeHidden();
    // Clicking the media surface also toggles playback; restore via real UI.
    await startPlaying();
  });
  await phase('fullscreen caption and menu close',async()=>{
    await subtitle(/^French/,'FRENCH QA CAPTION');await reveal();await button('Fullscreen').click();
    await expect.poll(()=>passive(()=>Boolean(document.fullscreenElement))).toBe(true);
    await expect(page.getByText('FRENCH QA CAPTION',{exact:true})).toBeVisible();
    // CDP Escape does not invoke Chromium's browser-level fullscreen accelerator.
    // Wadi's real F shortcut deterministically exercises its exit handler.
    await page.keyboard.press('f');await expect.poll(()=>passive(()=>Boolean(document.fullscreenElement))).toBe(false);
    if(engine==='web'){await page.setViewportSize({width:390,height:844});await reveal();await button('Subtitles').click();await expect(option('Subtitles',/^French/)).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:800});}
  });
  await phase('delayed stale subtitle and HTTP failure leave no stale cues',async()=>{
    await subtitle(/^English.*Stream · 2|^English.*Stream 2/,'ENGLISH QA CAPTION');
    await control({rules:{'/french.srt':{hold:true}}});
    await reveal();await button('Subtitles').click();await option('Subtitles',/^French/).click();await page.keyboard.press('Escape');
    await expect.poll(async()=> (await state()).pending).toContain('/french.srt');
    await expect(page.getByText('ENGLISH QA CAPTION',{exact:true})).toBeHidden();
    await subtitle(/^English.*Stream · 2|^English.*Stream 2/,'ENGLISH QA CAPTION');
    await control({rules:{'/french.srt':{}},release:'/french.srt'});
    await expect(page.getByText('FRENCH QA CAPTION',{exact:true})).toBeHidden();
    await control({rules:{'/french.srt':{status:503}}});
    await reveal();await button('Subtitles').click();await option('Subtitles',/^French/).click();await page.keyboard.press('Escape');
    const subtitleError=page.getByRole('alert').filter({hasText:'Could not load subtitles'});
    await expect(subtitleError).toContainText('Could not load subtitles');
    await control({rules:{'/french.srt':{}}});await subtitle(/^English.*Stream · 2|^English.*Stream 2/,'ENGLISH QA CAPTION');await expect(subtitleError).toBeHidden();
  });
  await phase('real clipboard pointer and keyboard preserve source query exactly',async()=>{
    await reveal();await button('Copy stream link').click();await expect(page.getByRole('status').filter({hasText:'Stream link copied.'})).toBeVisible();expect(await clipboard()).toBe(source(1));
    await audio(/^Japanese/,880);
    const reloadWindow={started:Date.now()};(evidence.navigationWindows??=[]).push(reloadWindow);
    await page.reload();await expect(seek).toHaveAttribute('aria-disabled','false');await startPlaying();
    if(engine==='native')await attachNative();
    await frequency(880);reloadWindow.finished=Date.now();await reveal();await button('Audio track').click();await expect(option('Audio tracks',/^Japanese/)).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');
    const sourceWindow={started:Date.now()};evidence.navigationWindows.push(sourceWindow);
    await page.goto(engine==='native'?'wadi://app/media/movie/qa-film?playback=qa-session-b':origin+'/media/movie/qa-film?playback=qa-session-b');
    await expect(seek).toHaveAttribute('aria-disabled','false');await startPlaying();if(engine==='native')await attachNative();await frequency(880);sourceWindow.finished=Date.now();
    await reveal();await button('Copy stream link').focus();await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:'Stream link copied.'})).toBeVisible();expect(await clipboard()).toBe(source(2));
    evidence.clipboard={pointer:source(1),keyboard:source(2),real:true};
    if(engine==='native') {
      await expect.poll(()=>passive(()=>navigator.userActivation.isActive),{timeout:10000,intervals:[100,250,500]}).toBe(false);
      const rejection=await passive(async url=>{try{await window.wadiDesktop.copyStreamLink(url);return 'unexpected success';}catch(error){return String(error);}},source(1));
      expect(rejection).toContain('Copy requires a user action');expect(await clipboard()).toBe(source(2));evidence.noGesture=rejection;
    }
  });
  await phase('Back and explicit source reopen retain resume and audio preference',async()=>{
    const backWindow={started:Date.now()};evidence.navigationWindows.push(backWindow);
    await reveal();await button('Pause').click();const box=await seek.boundingBox();await seek.click({position:{x:box.width*65/120,y:box.height/2}});await expect.poll(position).toBe(65);
    await control({clearWrites:true});
    await reveal();await button('Back').click();await expect(seek).toBeHidden();
    await expect(page.locator('[aria-label="Synthetic QA film details"]')).toBeVisible();
    await expect.poll(async()=> (await state()).writes.some(write=>write.media_type==='movie'&&write.media_id==='qa-film'&&write.video_id===null&&write.position>=64&&write.position<=66)).toBe(true);
    await button('Change stream').click();
    await page.getByRole('button').filter({has:page.getByText('QA 2',{exact:true})}).click();
    await expect(seek).toBeHidden();await button('Watch').click();
    await expect(seek).toHaveAttribute('aria-disabled','false');await startPlaying();if(engine==='native')await attachNative();await frequency(880);
    expect(await position()).toBeGreaterThanOrEqual(64);expect(await position()).toBeLessThan(75);
    await reveal();await button('Audio track').click();await expect(option('Audio tracks',/^Japanese/)).toHaveAttribute('aria-checked','true');await page.keyboard.press('Escape');
    await button('Copy stream link').click();await expect(page.getByRole('status').filter({hasText:'Stream link copied.'})).toBeVisible();expect(await clipboard()).toBe(source(2));
    backWindow.finished=Date.now();
  });
  if(engine==='web') await phase('separate injected clipboard failure has selectable fallback and close',async()=>{
    await passive(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Synthetic write denial');};});
    await reveal();await button('Copy stream link').click();await expect(page.getByRole('textbox',{name:'Stream link',exact:true})).toHaveValue(source(2));
    await page.getByRole('textbox',{name:'Stream link',exact:true}).focus();expect(await page.getByRole('textbox',{name:'Stream link',exact:true}).evaluate(node=>node.selectionEnd-node.selectionStart)).toBe(source(2).length);
    await button('Close link').click();await expect(page.getByRole('textbox',{name:'Stream link',exact:true})).toBeHidden();
  });
  if(engine==='web') {
    const detail=name=>page.locator(`[aria-label="${name} details"]`);
    const streamRow=id=>page.getByRole('button').filter({has:page.getByText(`QA ${id}`,{exact:true})});
    const anySeek=page.getByRole('slider',{name:/^Seek /});
    const selectedSession=()=>passive(()=>{const key=new URL(location.href).searchParams.get('playback');const raw=key&&sessionStorage.getItem(`wadi.playback.qa-profile.${key}`);return raw?JSON.parse(raw):null;});
    await phase('movie details auto-select on off explicit Watch and Back keep manual choice',async()=>{
      for(const enabled of [false,true]) {
        await page.goto(origin+`/qa/bootstrap?tracks=1&detail=1&auto=${enabled?1:0}`);
        await expect(detail('Synthetic QA film')).toBeVisible();await expect(button('Watch')).toBeEnabled();await expect(anySeek).toBeHidden();await expect(page).not.toHaveURL(/playback=/);
        await button('See streams').click();await expect(streamRow(1)).toHaveAttribute('aria-pressed','true');
        await streamRow(2).focus();await page.keyboard.press('Enter');await expect(streamRow(2)).toHaveAttribute('aria-pressed','true');await expect(anySeek).toBeHidden();
        await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'Choose stream'})).toBeHidden();await expect(button('Change stream')).toBeFocused();
        await button('Watch').focus();await page.keyboard.press('Enter');await expect(seek).toHaveAttribute('aria-disabled','false');await startPlaying();await frequency(440);
        expect((await selectedSession()).stream.url).toBe(source(2));
        await reveal();await button('Copy stream link').click();await expect(page.getByRole('status').filter({hasText:'Stream link copied.'})).toBeVisible();expect(await clipboard()).toBe(source(2));
        await button('Back').click();await expect(button('Watch')).toBeEnabled();await expect(detail('Synthetic QA film')).toBeVisible();
        await button('Change stream').click();await expect(streamRow(2)).toHaveAttribute('aria-pressed','true');await button('Close streams').focus();await page.keyboard.press('Enter');await expect(button('Change stream')).toBeFocused();
      }
      await page.setViewportSize({width:390,height:844});await button('Change stream').click();await expect(streamRow(2)).toHaveAttribute('aria-pressed','true');await page.screenshot({path:join(output,'movie-inline-mobile.png')});await button('Close streams').click();await page.setViewportSize({width:1280,height:800});
    });
    await phase('late movie response cannot replace another title reached through browsing',async()=>{
      const path='/api/streams/movie/qa-film';await control({rules:{[path]:{hold:true}}});
      await page.goto(origin+'/media/movie/qa-film');await expect.poll(async()=> (await state()).pending).toContain(path);await expect(button('Watch')).toBeDisabled();
      await button('Home').click();await button('Continue Synthetic second film').click();
      await expect(detail('Synthetic second film')).toBeVisible();await expect(button('Watch')).toBeEnabled();await expect(anySeek).toBeHidden();
      const completedBefore=(await state()).completed.filter(row=>row.path===path).length;
      await control({rules:{[path]:{}},release:path});await expect.poll(async()=> (await state()).completed.filter(row=>row.path===path).length).toBeGreaterThan(completedBefore);
      await button('See streams').click();await expect(streamRow(3)).toHaveAttribute('aria-pressed','true');await expect(streamRow(1)).toBeHidden();await expect(streamRow(2)).toBeHidden();await button('Close streams').click();
      await button('Watch').click();await expect(anySeek).toHaveAttribute('aria-disabled','false');await startPlaying();await frequency(440);
      const selected=await selectedSession();expect(selected.target).toMatchObject({mediaType:'movie',mediaId:'qa-film-b',videoId:null});expect(selected.stream.url).toBe(source(3));await button('Back').click();
    });
    await phase('inline loading errors empty unavailable and explicit retry',async()=>{
      const path='/api/streams/movie/qa-film-b';await control({rules:{[path]:{hold:true}}});await page.goto(origin+'/media/movie/qa-film-b');
      await expect.poll(async()=> (await state()).pending).toContain(path);await button('See streams').click();await expect(page.getByRole('status').filter({hasText:'Loading streams'})).toBeVisible();await expect(button('Watch')).toBeDisabled();
      await button('Close streams').click();await expect(button('See streams')).toBeFocused();await control({rules:{[path]:{}},release:path});await expect(button('Watch')).toBeEnabled();
      await control({rules:{[path]:{empty:true}}});await page.reload();await expect(page.getByRole('status').filter({hasText:'No streams returned.'})).toBeVisible();await expect(button('Watch')).toBeDisabled();await expect(anySeek).toBeHidden();
      await control({rules:{[path]:{unavailable:true}}});await page.reload();await expect(button('Watch')).toBeDisabled();await button('See streams').click();await page.getByRole('button',{name:/Unavailable synthetic stream/}).click();await expect(page.getByText(/Selected: Unavailable synthetic stream.*Unavailable/)).toBeVisible();await expect(anySeek).toBeHidden();
      await control({rules:{[path]:{status:503}}});await page.reload();const error=page.getByRole('alert').filter({hasText:'Could not load streams'});await expect(error).toBeVisible();await expect(button('Watch')).toBeDisabled();
      await control({rules:{[path]:{}}});await button('Retry').click();await expect(error).toBeHidden();await expect(button('Watch')).toBeEnabled();
    });
    await phase('show seasons episode-bound choices ignore late responses and restore Back',async()=>{
      const oldPath='/api/streams/series/qa-episode-1';await control({rules:{[oldPath]:{hold:true}}});await page.goto(origin+'/media/series/qa-show');
      await expect(detail('Synthetic QA show')).toBeVisible();await page.getByRole('button').filter({has:page.getByText('Synthetic episode 1',{exact:true})}).click();await expect.poll(async()=> (await state()).pending).toContain(oldPath);await expect(button('Watch')).toBeDisabled();
      await button('Change Episode').click();await button('Next season').click();await page.getByRole('button').filter({has:page.getByText('Synthetic episode 2',{exact:true})}).click();await expect(button('Watch')).toBeEnabled();await expect(anySeek).toBeHidden();
      const completedBefore=(await state()).completed.filter(row=>row.path===oldPath).length;await control({rules:{[oldPath]:{}},release:oldPath});await expect.poll(async()=> (await state()).completed.filter(row=>row.path===oldPath).length).toBeGreaterThan(completedBefore);
      await button('See streams').click();await expect(streamRow(7)).toHaveAttribute('aria-pressed','true');await expect(streamRow(5)).toBeHidden();await streamRow(8).click();await streamRow(8).click();await expect(streamRow(8)).toHaveAttribute('aria-pressed','true');await expect(anySeek).toBeHidden();await button('Close streams').click();
      await button('Watch').click();await expect(anySeek).toHaveAttribute('aria-disabled','false');await startPlaying();await frequency(440);
      const selected=await selectedSession();expect(selected.target).toMatchObject({mediaType:'series',mediaId:'qa-show',videoId:'qa-episode-2',episodeContext:{season:2,episode:2}});expect(selected.stream.url).toBe(source(8));evidence.detailEpisode={target:selected.target,source:selected.stream.url};
      await reveal();await button('Copy stream link').click();await expect(page.getByRole('status').filter({hasText:'Stream link copied.'})).toBeVisible();expect(await clipboard()).toBe(source(8));
      await reveal();await button('Pause').click();const box=await anySeek.boundingBox();await anySeek.click({position:{x:box.width*21/120,y:box.height/2}});await expect.poll(async()=>Number(await anySeek.getAttribute('aria-valuenow'))).toBe(21);
      await control({clearWrites:true});await button('Back').click();await expect(button('Watch')).toBeEnabled();
      await expect.poll(async()=> (await state()).writes.some(write=>write.media_type==='series'&&write.media_id==='qa-show'&&write.video_id==='qa-episode-2'&&write.position>=20&&write.position<=22)).toBe(true);
      expect((await state()).watches.find(watch=>watch.media_type==='series'&&watch.media_id==='qa-show'&&watch.video_id==='qa-episode-1').position_seconds).toBe(15);
      await button('Change stream').click();await expect(streamRow(8)).toHaveAttribute('aria-pressed','true');await button('Close streams').click();
      await button('Change Episode').click();await expect(page.getByRole('combobox',{name:'Season',exact:true})).toContainText('Season 2');await button('Previous season').click();await page.getByRole('button').filter({has:page.getByText('Synthetic episode 1',{exact:true})}).click();await expect(button('Watch')).toBeEnabled();await button('See streams').click();await expect(streamRow(5)).toHaveAttribute('aria-pressed','true');await expect(streamRow(8)).toBeHidden();await expect(anySeek).toBeHidden();
    });
  }
  evidence.fixture=await state();expect(evidence.fixture.unexpected).toEqual([]);expect(evidence.pageErrors).toEqual([]);
  // Keep every console entry in evidence. Only the specifically exercised HTTP
  // subtitle failure and blocked optional Cast bootstrap are expected.
  const unexpectedErrors=evidence.console.filter(x=>x.type==='error'&&!(/cast_sender\.js/.test(x.text)&&/Content Security Policy/.test(x.text))&&!(/Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)/.test(x.text)&&['delayed stale subtitle and HTTP failure leave no stale cues','inline loading errors empty unavailable and explicit retry'].includes(x.phase)));
  expect(unexpectedErrors).toEqual([]);
  const unexpectedRequests=evidence.network.filter(x=>!x.error?.includes('ERR_ABORTED')&&!(/cast_sender\.js/.test(x.url)&&(x.error==='csp'||x.error?.includes('ERR_BLOCKED_BY_CSP'))));
  expect(unexpectedRequests).toEqual([]);
  // Native service errors must not disappear into the attached-process log.
  // The prior cancelled-probe navigation diagnostic is retained separately,
  // only during the source/reload phase that subsequently proves real output.
  expect(nativeErrors()).toEqual([]);
  evidence.result='pass';
} catch(error) {
  evidence.result='fail';evidence.error=error.stack;process.exitCode=1;
  if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});
  if(passive)evidence.failureState=await passive(()=>({video:document.querySelector('video')?{paused:document.querySelector('video').paused,time:document.querySelector('video').currentTime,ready:document.querySelector('video').readyState,volume:document.querySelector('video').volume,muted:document.querySelector('video').muted,speed:document.querySelector('video').playbackRate}:null,contexts:globalThis.__wadiAudioProbe?.probes.map(a=>({state:a.context.state,time:a.context.currentTime})),controls:document.querySelector('.player-chrome')?.innerText})).catch(error=>({error:String(error),stack:error.stack}));
  console.error(JSON.stringify({lastSamples:evidence.samples.slice(-6),failureState:evidence.failureState,console:evidence.console,pageErrors:evidence.pageErrors}));
  console.error(error);
} finally {
  if(context)await context.tracing.stop({path:join(output,'trace.zip')}).catch(error=>{evidence.traceError=String(error);});
  if(engine==='native'&&page)await page.close({runBeforeUnload:false}).catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  for(const child of owned.reverse()) {
    const closed=child.closed?Promise.resolve():once(child,'close');
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    await Promise.race([closed,sleep(3000)]);
    if(!child.closed){child.kill('SIGKILL');await Promise.race([closed,sleep(3000)]);}
    await writeFile(join(output,`process-${child.pid}.log`),child.log.join(''));
    if(!child.closed){evidence.result='fail';process.exitCode=1;(evidence.cleanupErrors??=[]).push(`Owned process ${child.pid} did not exit`);}
  }
  for(const port of ownedPorts){try{await freePort(port);}catch(error){evidence.result='fail';process.exitCode=1;(evidence.cleanupErrors??=[]).push(`Owned port ${port} remained occupied: ${error}`);}}
  if(isolated&&/^\/.*\/wadi-native-qa-[^/]+$/.test(isolated))await rm(isolated,{recursive:true,force:true});
  const lateErrors=nativeErrors();
  if(lateErrors.length){evidence.result='fail';process.exitCode=1;evidence.lateErrors=lateErrors;}
  evidence.seconds=(Date.now()-started)/1000;await save();console.log(JSON.stringify({engine,result:evidence.result,seconds:evidence.seconds,output}));
}
