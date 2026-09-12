const { build } = require('./package.json');
const repository = process.env.WADI_RELEASE_REPOSITORY || 'westbrookdaniel/wadi';
if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('WADI_RELEASE_REPOSITORY must be owner/repository');
const [owner, repo] = repository.split('/');
module.exports = { ...build, publish: { provider: 'github', owner, repo, releaseType: 'draft' } };
