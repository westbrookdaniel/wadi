import { readFileSync } from 'node:fs';
const origin = new URL(process.env.WADI_WEB_ORIGIN || 'http://missing.invalid');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Set the WADI_WEB_ORIGIN repository variable to the hosted HTTPS origin before releasing.');
const releaseTag = process.env.WADI_RELEASE_TAG || (process.env.GITHUB_REF?.startsWith('refs/tags/v') ? process.env.GITHUB_REF_NAME : null);
const release = Boolean(releaseTag);
if (release) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  if (releaseTag !== `v${version}`) throw new Error('The release tag must match apps/desktop/package.json version.');
}
