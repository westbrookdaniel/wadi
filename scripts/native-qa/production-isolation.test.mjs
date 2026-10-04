import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionIsolation, productionModules } from './production-isolation.mjs';
const expected = Object.fromEntries(productionModules.map(name => [name, Buffer.from(`production ${name}`)]));
const fixture = () => ({ files: productionModules, manifest: { main: 'src/main.mjs' }, extract: name => expected[name], expected });
test('accepts unchanged production entry and modules without QA files', () => assertProductionIsolation(fixture()));
test('rejects credential adapter or QA entry in production ASAR', () => {
  for (const name of ['/credential-adapter.mjs', '\\app\\credential-adapter.mjs', '/launch.mjs', '/scripts/native-qa/launch.mjs']) assert.throws(() => assertProductionIsolation({ ...fixture(), files: [...productionModules, name] }), /entered production package/);
});
test('rejects production main switched to a synthetic entry', () => assert.throws(() => assertProductionIsolation({ ...fixture(), manifest: { main: 'launch.mjs' } }), /real main module/));
test('rejects a hidden production credential branch even when the adapter file is absent', () => assert.throws(() => assertProductionIsolation({ ...fixture(), extract: name => name === 'src/main.mjs' ? Buffer.from('import synthetic credentials') : expected[name] }), /module bytes changed/));
