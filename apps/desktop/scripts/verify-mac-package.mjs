import { join } from 'node:path';
import { verifyMacBinaryArchitecture } from './binary-architecture.mjs';
const [app,arch=process.arch]=process.argv.slice(2);
if (!app) throw new Error('Pass the finished Wadi.app path and target architecture');
for(const path of ['MacOS/Wadi','Resources/media-bin/ffmpeg','Resources/media-bin/ffprobe']) {
  const architectures=await verifyMacBinaryArchitecture(join(app,'Contents',path),arch);
  console.log(`${path}: ${architectures.join(', ')} (target ${arch})`);
}
