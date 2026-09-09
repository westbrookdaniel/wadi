import { fork } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function addConversionRoutes(app, { directory, enabled = false }) {
  const jobs = new Map();
  const dir = resolve(directory, 'conversion-cache');
  // Jobs never survive a restart. Remove only this server's disposable cache.
  rmSync(dir, { recursive: true, force: true });
  const discardFile = path => { void rm(path, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); };
  const remove = job => {
    clearTimeout(job.timeout); jobs.delete(job.id);
    if (job.worker && job.worker.exitCode === null && job.worker.signalCode === null) {
      job.worker.once('exit', () => discardFile(job.path)); job.worker.kill();
    } else discardFile(job.path);
  };
  const own = (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.owner !== req.user.id) { res.status(404).json({ error: 'Conversion not found' }); return null; }
    job.touched = Date.now();
    return job;
  };
  app.get('/api/server-capabilities', (_req, res) => res.json({ conversion: enabled }));
  app.post('/api/conversions', (req, res) => {
    if (!enabled) return res.status(403).json({ error: 'Conversion is disabled on this server' });
    let url;
    try { url = new URL(req.body.url); } catch { return res.status(400).json({ error: 'Invalid stream URL' }); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return res.status(400).json({ error: 'Use an HTTP or HTTPS stream' });
    for (const job of jobs.values()) if (Date.now() - job.touched > 30 * 60_000) remove(job);
    // A bounded cache and one native process keep small home servers usable.
    if ([...jobs.values()].some(job => job.status === 'working')) return res.status(409).json({ error: 'The server is converting another stream. Try original playback or wait.' });
    if (jobs.size >= 2) return res.status(409).json({ error: 'Conversion cache is in use. Close another converted stream first.' });
    mkdirSync(dir, { recursive: true });
    const id = randomUUID();
    const job = { id, owner: req.user.id, path: resolve(dir, id + '.mp4'), status: 'working', progress: 0, touched: Date.now() };
    jobs.set(id, job);
    const worker = fork(resolve(process.cwd(), 'server/conversion-worker.mjs'), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    job.worker = worker;
    job.timeout = setTimeout(() => { job.status = 'failed'; job.error = 'Conversion exceeded 30 minutes. Try original playback.'; worker.kill(); }, 30 * 60_000);
    job.timeout.unref();
    worker.on('message', message => {
      if (message.done) { job.status = 'ready'; job.progress = 1; }
      else if (message.error) { job.status = 'failed'; job.error = message.error; }
      else if (typeof message.progress === 'number') job.progress = Math.max(0, Math.min(1, message.progress));
    });
    const failed = () => { clearTimeout(job.timeout); if (job.status === 'working') { job.status = 'failed'; job.error = 'Codec libraries could not process this stream. Try original playback.'; } if (job.status === 'failed') discardFile(job.path); };
    worker.on('error', failed);
    worker.on('exit', failed);
    worker.send({ url: url.href, path: job.path, maxBytes: 4 * 1024 ** 3 });
    res.status(202).json({ id });
  });
  app.get('/api/conversions/:id', (req, res) => { const job = own(req, res); if (job) res.json({ status: job.status, progress: job.progress, error: job.error }); });
  app.get('/api/conversions/:id/media', (req, res) => {
    const job = own(req, res); if (!job) return;
    if (job.status !== 'ready') return res.status(409).json({ error: 'Conversion is not ready' });
    res.sendFile(job.path);
  });
  app.delete('/api/conversions/:id', (req, res) => { const job = own(req, res); if (job) { remove(job); res.sendStatus(204); } });
  const timer = setInterval(() => { for (const job of jobs.values()) if (Date.now() - job.touched > 30 * 60_000) remove(job); }, 60_000);
  timer.unref();
  return () => { clearInterval(timer); for (const job of jobs.values()) remove(job); };
}
