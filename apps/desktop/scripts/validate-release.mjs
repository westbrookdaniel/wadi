import { readFileSync } from 'node:fs';
const origin = new URL(process.env.WADI_WEB_ORIGIN || 'http://missing.invalid');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Set the WADI_WEB_ORIGIN repository variable to the hosted HTTPS origin before releasing.');
const release = process.env.GITHUB_REF?.startsWith('refs/tags/v');
if (release) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  if (process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('The release tag must match apps/desktop/package.json version.');
}
