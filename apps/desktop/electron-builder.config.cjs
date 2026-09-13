const { build } = require('./package.json');
module.exports = {
  ...build,
  // Ad-hoc signing seals the finished bundle without an Apple certificate.
  // Hardened library validation requires a Team ID that ad-hoc builds lack.
  mac: { ...build.mac, identity: '-', hardenedRuntime: false, notarize: false },
  publish: null,
};
