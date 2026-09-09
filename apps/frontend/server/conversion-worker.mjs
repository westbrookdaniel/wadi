// A separate process keeps native codec failures away from the web server.
import { registerMediabunnyServer } from '@mediabunny/server';
import { ALL_FORMATS, Input, UrlSource, Output, FilePathTarget, Mp4OutputFormat, Conversion } from 'mediabunny';
registerMediabunnyServer();
process.on('disconnect', () => process.exit(0));
process.once('message', async ({ url, path, maxBytes }) => {
  let input;
  try {
    input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
    const target = new FilePathTarget(path);
    target.onwrite = (_start, end) => { if (end > maxBytes) throw new Error('Converted file exceeds the cache limit'); };
    const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: false }) });
    const conversion = await Conversion.init({ input, output, video: { codec: 'avc' }, audio: { codec: 'aac' } });
    if (!conversion.isValid || conversion.discardedTracks.some(item => item.track.type === 'video' || item.track.type === 'audio')) throw new Error('This stream contains unsupported tracks');
    let last = 0;
    conversion.onProgress = progress => { if (Date.now() - last > 500) { last = Date.now(); process.send?.({ progress }); } };
    await conversion.execute();
    process.send?.({ done: true });
    input.dispose();
    process.exit(0);
  } catch {
    input?.dispose();
    process.send?.({ error: 'Conversion failed. Try original playback or a different stream.' });
    process.exit(1);
  }
});
