import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNativeErrors } from './native-errors.mjs';
const call = (at, action, id, outcome, message) => ({ at, text: JSON.stringify({ qaMedia: { action, id, outcome, message } }) });
const error = message => ({ at: 30, text: `Error occurred in handler for 'media': Error: ${message}` });
const window = [{ started: 0, finished: 40 }];
test('retains a stopped-ID cancellation with its successful navigation evidence', () => {
  const events = [call(10, 'stop', 'old', 'called'), call(20, 'start', 'old', 'rejected', 'Playback cancelled'), call(25, 'stop', 'old', 'resolved'), error('Playback cancelled')];
  const result = classifyNativeErrors(events, window);
  assert.deepEqual(result.errors, []); assert.equal(result.diagnostics.length, 1); assert.equal(result.cancellations[0].id, 'old');
});
test('fails cancellation for an active or different session', () => {
  for (const id of [undefined, 'other']) {
    const events = [call(10, 'stop', id, 'called'), call(15, 'stop', id, 'resolved'), call(20, 'start', 'active', 'rejected', 'Playback cancelled'), error('Playback cancelled')];
    assert.equal(classifyNativeErrors(events, window).errors.length, 1);
  }
});
test('fails when navigation did not complete or the diagnostic is outside its correlated interval', () => {
  const events = [call(10, 'stop', 'old', 'called'), call(15, 'stop', 'old', 'resolved'), call(20, 'start', 'old', 'rejected', 'Playback cancelled'), error('Playback cancelled')];
  assert.equal(classifyNativeErrors(events, [{ started: 0 }]).errors.length, 1);
  assert.equal(classifyNativeErrors([...events.slice(0, 3), { ...events[3], at: 1500 }], window).errors.length, 1);
});
test('never classifies active inspection/converter/disposed errors as cancellation', () => {
  const events = [error('Could not inspect this stream. Check the provider or choose another stream.'), error('Conversion stopped'), error('InputDisposedError')];
  assert.equal(classifyNativeErrors(events, window).errors.length, 3);
});
test('correlates reordered pipes once and keeps any additional same-text error failing', () => {
  const events = [call(10, 'stop', 'old', 'called'), call(15, 'stop', 'old', 'resolved'), call(31, 'start', 'old', 'rejected', 'Playback cancelled'), error('Playback cancelled'), error('Playback cancelled')];
  const result = classifyNativeErrors(events, window);
  assert.equal(result.diagnostics.length, 1); assert.equal(result.errors.length, 1);
});
test('a failed or incomplete stop never qualifies a cancellation', () => {
  for (const outcomes of [[], ['rejected'], ['resolved', 'rejected']]) {
    const events = [call(10, 'stop', 'old', 'called'), ...outcomes.map(outcome => call(15, 'stop', 'old', outcome)), call(20, 'start', 'old', 'rejected', 'Playback cancelled'), error('Playback cancelled')];
    assert.equal(classifyNativeErrors(events, window).errors.length, 1);
  }
});
test('a previously resolved stop outside this navigation cannot qualify a new failure', () => {
  const events = [call(-20, 'stop', 'old', 'called'), call(-15, 'stop', 'old', 'resolved'), call(20, 'start', 'old', 'rejected', 'Playback cancelled'), error('Playback cancelled')];
  assert.equal(classifyNativeErrors(events, window).errors.length, 1);
});
