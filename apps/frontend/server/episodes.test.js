import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisodes, mergeEpisodeSources, episodeRelease } from './episodes.js';
test('episode dates preserve precision and reject ambiguous or invalid dates', () => {
  assert.deepEqual(episodeRelease('2026-02-30'), {releasePrecision:'unknown'});
  assert.deepEqual(episodeRelease('2026-09-19T10:00:00'), {releasePrecision:'unknown'});
  assert.equal(episodeRelease('2026-09-19T10:00:00+08:00').released,'2026-09-19T02:00:00.000Z');
  assert.equal(episodeRelease('2026-09-19').releasePrecision,'date');
});
test('deduplicates provider episodes, retains aliases and separates specials', () => {
  const sources=[{addonId:'a',episodes:normalizeEpisodes([{id:'a:1',season:1,episode:1,released:'2026-09-18'},{id:'special',season:0,episode:1},{id:'bad',season:'x',episode:'unknown'},null])},
    {addonId:'b',episodes:normalizeEpisodes([{id:'b:1',season:'1',episode:'1',title:'Pilot',released:'2026-09-18'}])}];
  const items=mergeEpisodeSources(sources,[{video_id:'b:1',watched:1,updated_at:'2026-09-19T01:00:00Z'}],Date.parse('2026-09-19T12:00:00Z'));
  assert.equal(items.length,3);assert.equal(items[0].season,0);assert.deepEqual(items[1].videoIds,['a:1','b:1']);
  assert.equal(items[1].watched,true);assert.equal(items[1].releaseState,'released');assert.equal(items[2].releaseState,'unknown');
  assert.equal(mergeEpisodeSources(sources,[])[1].watched,false);
});
test('does not call a future or uncertain release available; latest watch action wins', () => {
  const sources=[{addonId:'a',episodes:normalizeEpisodes([{id:'x',season:1,episode:1,released:'2026-09-19'}])}];
  assert.equal(mergeEpisodeSources(sources,[],Date.parse('2026-09-19T23:00:00Z'))[0].releaseState,'upcoming');
  sources.push({addonId:'b',episodes:normalizeEpisodes([{id:'y',season:1,episode:1,released:'2026-09-20'}])});
  const item=mergeEpisodeSources(sources,[{video_id:'x',watched:1,updated_at:'2026-09-18'},{video_id:'y',watched:0,updated_at:'2026-09-19'}])[0];
  assert.equal(item.releaseState,'unknown');assert.equal(item.releaseConflicting,true);assert.equal(item.watched,false);
});
test('uses a precise release on the same day and rejects conflicting release times', () => {
  const source = (addonId, released) => ({ addonId, episodes: normalizeEpisodes([{ id: addonId, season: 1, episode: 1, released }]) });
  const precise = source('precise', '2026-09-19T10:00:00Z');
  for (const sources of [[source('day', '2026-09-19'), precise], [precise, source('day', '2026-09-19')]]) {
    const [item] = mergeEpisodeSources(sources, [], Date.parse('2026-09-19T11:00:00Z'));
    assert.equal(item.releasePrecision, 'instant');
    assert.equal(item.releaseState, 'released');
  }
  const [conflicting] = mergeEpisodeSources([precise, source('later', '2026-09-19T12:00:00Z')], [], Date.parse('2026-09-19T11:00:00Z'));
  assert.equal(conflicting.releaseState, 'unknown');
  assert.equal(conflicting.releaseConflicting, true);
});
