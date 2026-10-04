import { open } from 'node:fs/promises';
const cpuName = cpu => ({ 0x01000007:'x64', 0x0100000c:'arm64', 7:'ia32', 12:'arm' })[cpu];
export function machArchitectures(header) {
  if (header.length < 8) throw new Error('Truncated Mach-O header');
  const magic=header.readUInt32BE(0);
  if ([0xcefaedfe,0xcffaedfe,0xfeedface,0xfeedfacf].includes(magic)) {
    if (header.length < (magic===0xcffaedfe||magic===0xfeedfacf?32:28)) throw new Error('Truncated Mach-O header');
    const cpu=magic===0xcefaedfe||magic===0xcffaedfe?header.readUInt32LE(4):header.readUInt32BE(4);
    const arch=cpuName(cpu);
    if (!arch) throw new Error('Unknown Mach-O architecture');
    return [arch];
  }
  if (![0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca].includes(magic)) throw new Error('Not a Mach-O binary');
  const little=magic===0xbebafeca||magic===0xbfbafeca;
  const read=offset=>little?header.readUInt32LE(offset):header.readUInt32BE(offset);
  const count=read(4), size=magic===0xcafebabf||magic===0xbfbafeca?32:20;
  if (count<1 || count>16 || header.length<8+count*size) throw new Error('Invalid universal Mach-O header');
  const arches=[];
  for(let i=0;i<count;i++) {
    const arch=cpuName(read(8+i*size));
    if (!arch) throw new Error('Unknown Mach-O architecture');
    arches.push(arch);
  }
  return arches;
}
export async function verifyMacBinaryArchitecture(path, expected=process.arch) {
  if (!['arm64','x64'].includes(expected)) throw new Error('Unsupported macOS target architecture');
  const file=await open(path,'r');
  try {
    const header=Buffer.alloc(1024), {bytesRead}=await file.read(header,0,header.length,0);
    const arches=machArchitectures(header.subarray(0,bytesRead));
    if (!arches.includes(expected)) throw new Error(`Wrong architecture for ${path}: expected ${expected}, found ${arches.join(', ')}`);
    return arches;
  } finally { await file.close(); }
}
