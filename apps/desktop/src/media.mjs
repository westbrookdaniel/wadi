import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, readFile, readdir, stat, rename } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
const execute = promisify(execFile);
const sourceSchema = z.object({ url: z.url().refine(value => { const u=new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; }), headers: z.record(z.string().regex(/^[A-Za-z0-9-]+$/), z.string().max(4096).refine(v=>!/[\r\n]/.test(v))).default({}) });
const inputSchema = sourceSchema.extend({ id:z.string().uuid(), position:z.number().finite().nonnegative().default(0), audio:z.string().nullable().default(null), speed:z.number().min(0.25).max(4).default(1), forceVideo:z.boolean().default(false), conversionEnabled:z.boolean().default(true) });
const PROTOCOLS = 'http,https,tcp,tls,crypto';
export async function createMediaService({ directory, binaries }) {
  await rm(directory, { recursive:true, force:true }); await mkdir(directory, { recursive:true });
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const ffmpeg = join(binaries, 'ffmpeg'+suffix), ffprobe = join(binaries,'ffprobe'+suffix);
  const secret = randomBytes(32).toString('base64url');
  const producerSecret = randomBytes(32).toString('base64url');
  const jobs = new Map(), resources = new Map(), probeCache = new Map();
  let closed = false;
  const cancelled = new Set(), probes = new Map();
  const headersFor = input => Object.entries(input.headers).filter(([key])=>!['host','connection','content-length','range'].includes(key.toLowerCase()));
  const networkArgs = input => ['-protocol_whitelist',PROTOCOLS,'-rw_timeout','15000000', ...(headersFor(input).length ? ['-headers', headersFor(input).map(([k,v])=>`${k}: ${v}\r\n`).join('')] : [])];
  const stop = async job => {
    if (!job) return;
    jobs.delete(job.id);
    job.abort.abort();
    for (const wake of job.waiters) wake();
    if(job.resourceId)resources.delete(job.resourceId);
    if (job.process && job.process.exitCode === null) {
      await new Promise(resolve => { const timeout=setTimeout(()=>{job.process.kill('SIGKILL');resolve();},2000); job.process.once('close',()=>{clearTimeout(timeout);resolve();});job.process.kill(); });
    }
    await rm(job.path,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  };
  const handleRequest = async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      // FFmpeg uploads locally. Delaying a segment applies cross-platform backpressure
      // to the converter without stopping the renderer or discarding its paused frame.
      if (url.pathname.startsWith('/'+producerSecret+'/')) {
        const [, , id, file] = url.pathname.split('/');
        const job = jobs.get(id);
        if (req.method !== 'PUT' || req.headers.origin || !job || !/^(index\.m3u8|segment\d+\.ts)$/.test(file ?? '')) { res.writeHead(403); res.end(); return; }
        req.setTimeout(0); res.setTimeout(0);
        // FFmpeg can use separate connections for playlists and segments. Process
        // them in arrival order so fast encoders cannot outrun the buffer counter.
        const previous = job.uploads;
        let release;
        job.uploads = new Promise(resolve => { release = resolve; });
        await previous;
        try {
          if (file !== 'index.m3u8') {
            while (jobs.has(id) && job.producedEnd - job.position >= 32) {
              await new Promise(resolve => { job.waiters.add(resolve); });
            }
          }
          if (!jobs.has(id)) { res.writeHead(410); res.end(); return; }
          if (req.headers.expect === '100-continue') res.writeContinue();
          let bytes = 0;
          const limit = file === 'index.m3u8' ? 256 * 1024 : 128 * 1024 * 1024;
          const bounded = new Transform({ transform(chunk, encoding, callback) {
            bytes += chunk.length;
            callback(bytes > limit ? new Error('Local media segment is too large') : null, chunk);
          } });
          const path = join(job.path, file);
          await pipeline(req, bounded, createWriteStream(path + '.upload'), { signal: job.abort.signal });
          await rename(path + '.upload', path);
          if (file === 'index.m3u8') {
            const playlist = await readFile(path, 'utf8');
            for (const match of playlist.matchAll(/#EXTINF:([\d.]+),[^\n]*\nsegment(\d+)\.ts/g)) {
              const sequence = Number(match[2]);
              if (sequence > job.lastSegment) { job.producedEnd += Number(match[1]); job.lastSegment = sequence; }
            }
            // Keep more than the advertised window, including segments in flight.
            for (const name of await readdir(job.path)) {
              const match = /^segment(\d+)\.ts$/.exec(name);
              if (match && Number(match[1]) < job.lastSegment - 28) await rm(join(job.path, name), { force: true });
            }
          }
          res.writeHead(200); res.end(); return;
        } finally { release(); }
      }
      if (!url.pathname.startsWith('/'+secret+'/') || req.headers.origin && req.headers.origin !== 'wadi://app') {res.writeHead(403);res.end();return;}
      res.setHeader('Access-Control-Allow-Origin','wadi://app');
      res.setHeader('Access-Control-Allow-Headers','Range');
      res.setHeader('Access-Control-Expose-Headers','Content-Range,Content-Length,Accept-Ranges');
      res.setHeader('Cache-Control','no-store');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const [, ,kind,id,file] = url.pathname.split('/');
      if(kind==='resource') {
        const source=resources.get(id); if(!source){res.writeHead(404);res.end();return;}
        source.touched=Date.now();
        const controller=new AbortController();res.on('close',()=>controller.abort());
        const upstream=await fetch(source.url,{ headers:{...Object.fromEntries(headersFor(source)),...(req.headers.range?{Range:req.headers.range}:{})},method:req.method,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]) });
        res.statusCode=upstream.status;
        for(const key of ['content-type','content-range','content-length','accept-ranges'])if(upstream.headers.has(key))res.setHeader(key,upstream.headers.get(key));
        if(!upstream.body||req.method==='HEAD'){res.end();return;}
        await pipeline(Readable.fromWeb(upstream.body),res);return;
      }
      const job=jobs.get(id);
      if(kind!=='session'||!job||!/^index\.m3u8$|^segment\d+\.ts$/.test(file??'')){res.writeHead(404);res.end();return;}
      job.touched=Date.now();
      const path=join(job.path,file);
      res.setHeader('Content-Type',file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t');
      const info=await stat(path);res.setHeader('Content-Length',info.size);
      if(req.method==='HEAD')res.end();else await pipeline(createReadStream(path),res);
    } catch { if(res.headersSent)res.destroy();else{res.writeHead(404);res.end();} }
  };
  const server = createServer(handleRequest);
  server.on('checkContinue', handleRequest);
  server.keepAliveTimeout = 0; // Retain both FFmpeg upload connections across long pauses.
  server.requestTimeout = 0; // A paused converter may wait indefinitely for buffer space.
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}/${secret}`;
  const probe = async input => {
    const key=JSON.stringify([input.url,input.headers]);
    if(probeCache.has(key))return probeCache.get(key);
    const controller = new AbortController(); probes.set(input.id, controller);
    let stdout;
    try { ({stdout}=await execute(ffprobe,[...networkArgs(input),'-v','error','-show_streams','-show_format','-of','json',input.url],{signal:controller.signal,timeout:30000,maxBuffer:2*1024*1024,windowsHide:true})); }
    catch { throw new Error('Could not inspect this stream. Check the provider or choose another stream.'); }
    finally { probes.delete(input.id); }
    const data=JSON.parse(stdout);
    if(probeCache.size>=8)probeCache.clear();probeCache.set(key,data);return data;
  };
  const start = async payload => {
    if(closed)throw new Error('App is closing');
    const input=inputSchema.parse(payload);
    if(cancelled.delete(input.id))throw new Error('Playback cancelled');
    const data=await probe(input);
    if(closed||cancelled.delete(input.id))throw new Error('Playback cancelled');
    const video=data.streams.find(s=>s.codec_type==='video');
    const audioTracks=data.streams.filter(s=>s.codec_type==='audio');
    const audio=audioTracks.find(s=>String(s.index)===input.audio)??audioTracks[0];
    const copyVideo=video?.codec_name==='h264'&&(!video.pix_fmt||video.pix_fmt==='yuv420p')&&!input.forceVideo;
    const copyAudio=!audio||audio.codec_name==='aac';
    if (!input.conversionEnabled && ((video && !copyVideo) || !copyAudio)) throw new Error('This stream needs audio or video conversion. Enable conversion in device settings or choose another stream.');
    for(const job of jobs.values())await stop(job);
    const id=input.id,path=join(directory,id);await mkdir(path);
    const job={id,path,touched:Date.now(),error:null,process:null,abort:new AbortController(),waiters:new Set(),uploads:Promise.resolve(),position:0,producedEnd:0,lastSegment:-1,offset:input.position};jobs.set(id,job);
    const describe = (url,mode,offset) => ({id,url,duration:Number(data.format?.duration)||0,offset,hasVideo:Boolean(video),hasAudio:Boolean(audio),audioTracks:audioTracks.map(s=>({id:String(s.index),label:s.tags?.title??s.tags?.language??`Audio ${s.index}`,language:s.tags?.language??''})),selectedAudioTrackId:audio?String(audio.index):null,mode});
    if(copyVideo&&copyAudio&&audioTracks.length<=1&&data.format?.format_name?.split(',').includes('mp4')) {
      job.resourceId=randomUUID();resources.set(job.resourceId,{...input,touched:Date.now()});
      return describe(`${base}/resource/${job.resourceId}`,'direct',0);
    }
    const encoder=process.env.WADI_VIDEO_ENCODER ?? (process.platform==='darwin'?'h264_videotoolbox':'libx264');
    if(!['h264_videotoolbox','h264_nvenc','h264_qsv','h264_amf','h264_vaapi','libx264'].includes(encoder))throw new Error('Unsupported WADI_VIDEO_ENCODER');
    const launch = chosen => {
      const args=['-hide_banner','-loglevel','error','-nostdin','-y',...(chosen==='h264_vaapi'&&video&&!copyVideo?['-vaapi_device',process.env.WADI_VAAPI_DEVICE||'/dev/dri/renderD128']:[]),...networkArgs(input),'-ss',String(input.position),'-i',input.url];
      if(video)args.push('-map',`0:${video.index}`,'-c:v',copyVideo?'copy':chosen);
      if(video&&!copyVideo){
        if(chosen==='libx264')args.push('-preset','veryfast','-crf','21');
        else args.push('-b:v','6000k');
        if(chosen==='h264_videotoolbox')args.push('-allow_sw','1');
        if(chosen==='h264_vaapi')args.push('-vf','format=nv12,hwupload');
        else args.push('-pix_fmt','yuv420p');
        args.push('-force_key_frames','expr:gte(t,n_forced*4)');
      }
      if(audio){args.push('-map',`0:${audio.index}`,'-c:a',copyAudio?'copy':'aac');if(!copyAudio)args.push('-b:a','192k','-ac','2');}
      // A local username activates FFmpeg's automatic Expect: 100-continue
      // handshake on each upload. The random path token authorizes this endpoint.
      args.push('-sn','-dn','-max_muxing_queue_size','2048','-f','hls','-hls_time','4','-hls_list_size','24','-method','PUT','-http_persistent','1','-hls_segment_filename',`http://producer@127.0.0.1:${server.address().port}/${producerSecret}/${id}/segment%d.ts`,`http://producer@127.0.0.1:${server.address().port}/${producerSecret}/${id}/index.m3u8`);
      const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});job.process=child;job.encoder=video?(copyVideo?'copy':chosen):null;
      // Provider URLs and credentials from stderr must not reach logs or UI.
      child.stderr.resume();
      child.on('error',()=>{job.error='Could not start the bundled media converter';});
      child.on('exit',code=>{if(code&&jobs.has(id))job.error='Conversion stopped. Try another stream or software encoding.';});
    };
    launch(encoder);
    let retried=false;
    for(let i=0;i<240;i++){
      if(!jobs.has(id)||closed)throw new Error('Playback cancelled');
      job.touched=Date.now();
      try {const playlist=await readFile(join(path,'index.m3u8'),'utf8');if(playlist.includes('#EXTINF'))return {id,url:`${base}/session/${id}/index.m3u8`,duration:Number(data.format?.duration)||0,offset:input.position,hasVideo:Boolean(video),hasAudio:Boolean(audio),audioTracks:audioTracks.map(s=>({id:String(s.index),label:s.tags?.title??s.tags?.language??`Audio ${s.index}`,language:s.tags?.language??''})),selectedAudioTrackId:audio?String(audio.index):null,mode:copyVideo?(copyAudio?'remux':'audio'):'video'};} catch{}
      if(job.error){if(!copyVideo&&encoder!=='libx264'&&!retried){retried=true;job.error=null;await rm(path,{recursive:true,force:true});await mkdir(path);launch('libx264');}else{const error=job.error;await stop(job);throw new Error(error);}}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    await stop(job);throw new Error('Stream did not become playable within 60 seconds');
  };
  // Serialize session changes so rapid seeks cannot leave orphaned converters.
  let operations=Promise.resolve();
  const serialized=action=>{const next=operations.then(action);operations=next.catch(()=>{});return next;};
  const timer=setInterval(()=>{
    for(const job of jobs.values()) {
      if(Date.now()-job.touched>45000){void serialized(()=>stop(job));continue;}
      void readdir(job.path).then(async files=>{let size=0;for(const file of files)size+=(await stat(join(job.path,file))).size;if(size>512*1024*1024){job.error='Local media cache reached its 512 MB limit. Choose a smaller stream.';job.process?.kill();}}).catch(()=>{});
    }
    for(const [id,resource]of resources)if(Date.now()-resource.touched>3600000)resources.delete(id);
  },10000);timer.unref();
  return {
    command: async(action,payload)=>{
      if(action==='start')return serialized(()=>start(payload));
      if(action==='stop'){const id=z.string().uuid().parse(payload);cancelled.add(id);if(cancelled.size>100)cancelled.delete(cancelled.values().next().value);probes.get(id)?.abort();return stop(jobs.get(id));}
      if(action==='progress') {
        const input=z.object({id:z.string().uuid(),position:z.number().finite().nonnegative()}).parse(payload);
        const job=jobs.get(input.id);
        if(!job)return {error:'Playback session ended'};
        job.touched=Date.now(); job.position=Math.max(0,input.position-job.offset);
        const waiters=[...job.waiters];job.waiters.clear();for(const wake of waiters)wake();
        return {error:job.error};
      }
      if(action==='status'){const job=jobs.get(z.string().uuid().parse(payload));if(!job)return {error:'Playback session ended'};job.touched=Date.now();return {error:job.error,encoder:job.encoder};}
      if(action==='resource'){const input=sourceSchema.parse(payload);if(resources.size>=200)resources.delete(resources.keys().next().value);const id=randomUUID();resources.set(id,{...input,touched:Date.now()});return `${base}/resource/${id}`;}
      throw new Error('Unknown media operation');
    },
    close:async()=>{closed=true;for(const controller of probes.values())controller.abort();clearInterval(timer);server.closeAllConnections();server.close();await Promise.all([...jobs.values()].map(stop));resources.clear();},
  };
}
