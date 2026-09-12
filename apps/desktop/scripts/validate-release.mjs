import { readFileSync } from 'node:fs';
const origin = new URL(process.env.WADI_WEB_ORIGIN || 'http://missing.invalid');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Set the WADI_WEB_ORIGIN repository variable to the hosted HTTPS origin before releasing.');
const release = process.env.GITHUB_REF?.startsWith('refs/tags/v');
if (release) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  if (process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('The release tag must match apps/desktop/package.json version.');
  const required = process.platform === 'darwin' ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'] : process.platform === 'win32' ? ['CSC_LINK', 'CSC_KEY_PASSWORD'] : [];
  for (const name of required) if (!process.env[name]) throw new Error(`Missing signing/notarization setting: ${name}. Windows uses WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD secrets.`);
} else if (!process.env.CSC_LINK && process.platform !== 'linux') {
  console.warn('No signing certificate: these manual artifacts are for testing, not a production update release.');
}
