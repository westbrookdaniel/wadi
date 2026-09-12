const { build } = require('./package.json');
module.exports = { ...build, mac: { ...build.mac, identity: null, notarize: false }, publish: null };
