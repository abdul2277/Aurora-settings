// Run after the build:  node scripts/stamp.js dist/Vorynth-Settings.exe
const { stamp, readStamp } = require('../lib/buildstamp');
const version = require('../package.json').version; const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/stamp.js <exe>'); process.exit(1); }
const build = Math.floor(Date.now() / 60000); stamp(file, version, build);
console.log('Stamped', file, JSON.stringify(readStamp(file)));
