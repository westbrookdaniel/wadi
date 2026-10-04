const messages = ['Playback cancelled', 'Could not inspect this stream. Check the provider or choose another stream.'];

// A cancellation is expected only when the same real start ID was explicitly
// stopped and the navigation subsequently proved output/resume/clipboard.
// Keep both the original Electron error and its correlated IPC evidence.
export function classifyNativeErrors(events, windows = []) {
  const observed = events.flatMap(event => {
    try { const data = JSON.parse(event.text).qaMedia; return data ? [{ ...event, ...data }] : []; }
    catch { return []; }
  });
  const cancelled = observed.filter(event => event.action === 'start' && event.outcome === 'rejected' && typeof event.id === 'string' && event.id.length > 0 && messages.includes(event.message)
    && windows.some(window => window.finished && event.at >= window.started && event.at <= window.finished
      && observed.some(stop => stop.action === 'stop' && stop.outcome === 'called' && stop.id === event.id && stop.at >= window.started && stop.at <= event.at
        && observed.some(result => result.action === 'stop' && result.id === event.id && result.outcome === 'resolved' && result.at >= stop.at && result.at <= window.finished)
        && !observed.some(result => result.action === 'stop' && result.id === event.id && result.outcome === 'rejected' && result.at >= stop.at && result.at <= window.finished))));
  const errors = events.filter(event => /Error occurred in handler|InputDisposedError|UnhandledPromiseRejection|Conversion stopped|Could not start the bundled media converter/.test(event.text));
  const remaining = new Set(cancelled);
  const diagnostics = errors.filter(event => {
    // stdout/stderr are separate pipes and can arrive in either order. Match
    // one error line per rejected ID, never all nearby errors with that text.
    const start = [...remaining].find(start => event.text.trim() === `Error occurred in handler for 'media': Error: ${start.message}` && Math.abs(event.at - start.at) <= 1000
      && windows.some(window => window.finished && event.at >= window.started && event.at <= window.finished));
    if (!start) return false;
    remaining.delete(start); return true;
  });
  return { diagnostics, cancellations: cancelled, errors: errors.filter(event => !diagnostics.includes(event)) };
}
