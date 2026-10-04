import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { machArchitectures, verifyMacBinaryArchitecture } from '../scripts/binary-architecture.mjs';
function thin(cpu,little=true) {
  const data=Buffer.alloc(32);
  data.writeUInt32BE(little?0xcffaedfe:0xfeedfacf);
  little?data.writeUInt32LE(cpu,4):data.writeUInt32BE(cpu,4);
  return data;
}
function universal(cpus,wide=false,little=false) {
  const data=Buffer.alloc(8+cpus.length*(wide?32:20));
  data.writeUInt32BE(wide?(little?0xbfbafeca:0xcafebabf):(little?0xbebafeca:0xcafebabe));
  const write=(value,offset)=>little?data.writeUInt32LE(value,offset):data.writeUInt32BE(value,offset);
  write(cpus.length,4);
  cpus.forEach((cpu,i)=>write(cpu,8+i*(wide?32:20)));
  return data;
}
test('identifies native arm64/x64 and compatible universal Mach-O headers',()=>{
  for(const little of [true,false]) {
    assert.deepEqual(machArchitectures(thin(0x0100000c,little)),['arm64']);
    assert.deepEqual(machArchitectures(thin(0x01000007,little)),['x64']);
    for(const wide of [true,false]) assert.deepEqual(machArchitectures(universal([0x01000007,0x0100000c],wide,little)),['x64','arm64']);
  }
});
test('fails closed on malformed, unknown and non-Mach-O binaries',()=>{
  for(const header of [Buffer.alloc(0),Buffer.alloc(32),thin(99),thin(0x0100000c).subarray(0,8),universal([]),universal([99]),universal([0x01000007]).subarray(0,10)]) assert.throws(()=>machArchitectures(header));
});
test('rejects mislabeled x86_64 ffprobe on arm64 and accepts native/universal targets',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'wadi-arch-test-')),file=join(directory,'ffprobe');
  try {
    await writeFile(file,thin(0x01000007));
    await assert.rejects(verifyMacBinaryArchitecture(file,'arm64'),/expected arm64, found x64/);
    assert.deepEqual(await verifyMacBinaryArchitecture(file,'x64'),['x64']);
    await writeFile(file,thin(0x0100000c));
    assert.deepEqual(await verifyMacBinaryArchitecture(file,'arm64'),['arm64']);
    await assert.rejects(verifyMacBinaryArchitecture(file,'x64'),/expected x64, found arm64/);
    await writeFile(file,universal([0x01000007,0x0100000c]));
    await verifyMacBinaryArchitecture(file,'arm64'); await verifyMacBinaryArchitecture(file,'x64');
    await assert.rejects(verifyMacBinaryArchitecture(file,'ia32'),/Unsupported/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
