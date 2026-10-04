// Legal synthetic fixtures built in CI, never on the shared QA computer.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [directory, binary] = process.argv.slice(2);
if (!directory || !binary) throw new Error('Pass new fixture directory and pinned FFmpeg path');
const output = resolve(directory);
await mkdir(output);
execFileSync(resolve(binary), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=120', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=120', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=120', '-map', '0:v:0', '-map', '1:a:0', '-map', '2:a:0', '-c:v', 'libvpx-vp9', '-b:v', '150k', '-c:a', 'libopus', '-b:a', '32k', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English 440 Hz', '-disposition:a:0', 'default', '-metadata:s:a:1', 'language=jpn', '-metadata:s:a:1', 'title=Japanese 880 Hz', '-disposition:a:1', '0', join(output, 'multitrack.webm')]);
await copyFile(join(output, 'multitrack.webm'), join(output, 'fixture.webm'));
for (const [name, text] of [['english.srt', 'ENGLISH QA CAPTION'], ['french.srt', 'FRENCH QA CAPTION'], ['fixture.srt', 'ENGLISH QA CAPTION']]) await writeFile(join(output, name), `1\n00:00:00,000 --> 00:02:00,000\n${text}\n`);
await writeFile(join(output, 'index.html'), '<!doctype html><title>Wadi synthetic API fixture</title>');
