#!/usr/bin/env node
// Decrypts files made by Vorynth (Drop downloads saved as f.aur, and "Lock a file" .aur files) without needing the app.
//   node tools/vorynth-decrypt.js f.aur --link "http://192.168.1.5:5050/<token>/#k=...&n=..."     (Drop file; saves under its original name)
//   node tools/vorynth-decrypt.js f.aur --key <key>                                               (key from the link after #k=)
//   node tools/vorynth-decrypt.js report.pdf.aur --ask                                            (password-locked file; asks without echo)
//   AURORA_PASSWORD=... node tools/vorynth-decrypt.js report.pdf.aur --out report.pdf
const fs = require('fs'); const path = require('path'); const readline = require('readline');
const E = require('../lib/e2ee');
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; }; const flag = (n) => process.argv.includes(n);
const fail = (m) => { console.error('Error: ' + m); process.exit(1); };
function ask(q) { return new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true }); rl._writeToOutput = (s) => { if (s.includes(q)) process.stderr.write(s); }; rl.question(q, (a) => { rl.close(); process.stderr.write('\n'); resolve(a); }); }); }
(async () => {
  const file = process.argv[2]; if (!file || file.startsWith('--')) fail('Usage: vorynth-decrypt <file.aur> [--link URL | --key KEY | --ask | --password-file F] [--out PATH]');
  if (!fs.existsSync(file)) fail('File not found: ' + file);
  let out = arg('--out'); let key = null; const link = arg('--link'); let keyArg = arg('--key');
  // a name taken from the link is saved next to the input file, never in the current folder
  if (link) { let u; try { u = new URL(link); } catch (_) { fail('That is not a valid link'); } const q = new URLSearchParams(u.hash.slice(1)); keyArg = q.get('k') || keyArg; if (!out && q.get('n')) out = path.join(path.dirname(path.resolve(file)), path.basename(E.fromB64u(q.get('n')).toString('utf8')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, '_')); if (!keyArg) fail('The link has no key (the part after #). Copy the whole link.'); }
  const head = Buffer.alloc(E.HEADER_LEN); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, E.HEADER_LEN, 0); fs.closeSync(fd); let h; try { h = E.parseHeader(head); } catch (e) { fail(e.message); }
  if (!out) out = h.kdf === E.KDF.SCRYPT && /\.aur$/i.test(file) ? file.replace(/\.aur$/i, '') : file + '.decrypted'; if (fs.existsSync(out) && !flag('--force')) fail(out + ' already exists (use --force to replace it)');
  const tmp = out + '.' + process.pid + '.tmp';
  try {
    if (h.kdf === E.KDF.RAW) { if (!keyArg) fail('This file needs its key: use --link or --key'); E.decryptFileSync(file, tmp, E.fromB64u(keyArg)); }
    else { const pw = arg('--password-file') ? fs.readFileSync(arg('--password-file'), 'utf8').replace(/\r?\n$/, '') : (process.env.AURORA_PASSWORD || (flag('--ask') ? await ask('Password: ') : '')); if (!pw) fail('This file is password-locked: use --ask, --password-file, or set AURORA_PASSWORD'); await E.decryptFileWithPassword(file, tmp, pw); }
    fs.renameSync(tmp, out); console.log('Saved ' + out);
  } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch (_) {} fail(e.message); }
})();
