'use strict';
/* Aurora PC rating (cross-platform). Same idea as the old Windows Experience Index: timed tests, each scored 1.0-9.9, base score = weakest part.
   Same scoring maths as the Aurora OS tool, so numbers from both are comparable. Scores compare only with other Aurora ratings. */
const os = require('os'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { Worker } = require('worker_threads');

const score = (v, lo, hi) => { if (!(v > 0)) return 1.0; const x = (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)); return Math.round(Math.max(1, Math.min(9.9, 1 + 8.9 * x)) * 10) / 10; };

function sampleData(n) { let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const words = []; for (let i = 0; i < 400; i++) { let w = ''; const l = 3 + Math.floor(rnd() * 7); for (let j = 0; j < l; j++) w += String.fromCharCode(97 + Math.floor(rnd() * 26)); words.push(w); } const parts = []; let len = 0; while (len < n) { const w = words[Math.floor(rnd() * words.length)] + ' '; parts.push(w); len += w.length; } return Buffer.from(parts.join('').slice(0, n)); }

function burn(secs, data) { const stop = Date.now() + secs * 1000; let done = 0; const t0 = process.hrtime.bigint(); while (Date.now() < stop) { zlib.deflateSync(data, { level: 6 }); done += data.length; } return { bytes: done, sec: Number(process.hrtime.bigint() - t0) / 1e9 }; }

const WORKER_SRC = `const {parentPort,workerData}=require('worker_threads');const zlib=require('zlib');const d=Buffer.from(workerData.data);const stop=Date.now()+workerData.secs*1000;let done=0;while(Date.now()<stop){zlib.deflateSync(d,{level:6});done+=d.length;}parentPort.postMessage(done);`;

async function cpu(quick) {
  const secs = quick ? 1 : 2, data = sampleData(4e6); const one = burn(secs, data); const single = one.bytes / one.sec / 1e6;
  const n = Math.max(1, os.cpus().length); const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: n }, () => new Promise((ok) => { const w = new Worker(WORKER_SRC, { eval: true, workerData: { data, secs } }); w.once('message', ok); w.once('error', () => ok(0)); })));
  const multi = res.reduce((a, b) => a + b, 0) / ((Date.now() - t0) / 1000) / 1e6;
  const s1 = score(single, 12, 140), sm = score(multi, 25, 1800);
  return { score: Math.round((s1 + sm) / 2 * 10) / 10, singleMBs: +single.toFixed(1), multiMBs: +multi.toFixed(1), threads: n, model: (os.cpus()[0] || {}).model || '', singleScore: s1, multiScore: sm };
}

function memory(quick) {
  const size = (quick ? 64 : 128) * 2 ** 20, a = Buffer.alloc(size, 1), b = Buffer.alloc(size); let best = 0;
  for (let i = 0; i < (quick ? 4 : 8); i++) { const t = process.hrtime.bigint(); a.copy(b); const dt = Number(process.hrtime.bigint() - t) / 1e9; best = Math.max(best, 2 * size / dt / 1e9); }
  const gb = os.totalmem() / 2 ** 30, sc = score(best, 2, 40), cap = gb < 1.8 ? 3 : gb < 3.6 ? 5 : gb < 7.4 ? 6.5 : gb < 15 ? 8 : 9.9;
  return { score: Math.min(sc, cap), bandwidthGBs: +best.toFixed(1), totalGB: +gb.toFixed(1), speedScore: sc, cappedBySize: sc > cap };
}

function disk(quick, dir) {
  const size = (quick ? 96 : 192) * 2 ** 20, buf = require('crypto').randomBytes(4 * 2 ** 20), p = path.join(dir || os.tmpdir(), '.aurora-rating-' + process.pid + '.tmp');
  try {
    const fd = fs.openSync(p, 'w'); const t = process.hrtime.bigint(); for (let i = 0; i < size / buf.length; i++) fs.writeSync(fd, buf); fs.fsyncSync(fd); const w = size / (Number(process.hrtime.bigint() - t) / 1e9) / 1e6; fs.closeSync(fd);
    return { score: score(w, 25, 3500), writeMBs: Math.round(w), note: 'Measured by writing and flushing a temporary file to your drive (it is deleted afterwards). Reads are not timed because the system cache would make them look faster than the drive really is.' };
  } catch (e) { return { score: null, note: 'Could not test the drive: ' + String(e.message).slice(0, 80) }; } finally { try { fs.unlinkSync(p); } catch (_) {} }
}

function graphics(name) {
  const n = String(name || '').toLowerCase(); let s, note;
  if (!n) return { score: null, note: 'Windows did not report a graphics device.' };
  if (/llvmpipe|softpipe|swrast|software|swiftshader|basic render|virtio|vmware|svga|qxl|bochs|cirrus|hyper-v|microsoft basic/.test(n)) { s = 1.5; note = 'Software or virtual graphics: no real GPU is being used'; }
  else if (/rtx\s*(40|50)|rx\s*(7|9)\d{3}/.test(n)) { s = 9.2; note = 'Fast discrete GPU'; }
  else if (/rtx|rx\s*[5-6]\d{3}|arc a|gtx\s*(16|10[6-8])/.test(n)) { s = 7.8; note = 'Strong discrete GPU'; }
  else if (/gtx|radeon rx|geforce|quadro|radeon pro/.test(n)) { s = 6.5; note = 'Discrete GPU'; }
  else if (/iris xe|xe graphics|vega|radeon graphics|680m|780m|apple/.test(n)) { s = 5.6; note = 'Good integrated graphics'; }
  else if (/uhd|iris|hd graphics|radeon|intel/.test(n)) { s = 4.2; note = 'Basic integrated graphics'; }
  else { s = 3.5; note = 'Unrecognised graphics device'; }
  return { score: s, renderer: name, estimated: true, note: note + ' (estimated from the model name; this part is not a timed test)' };
}

const TIPS = { Processor: 'A faster or newer CPU would help most.', Memory: 'More RAM would help most.', Disk: 'An SSD would help most (it speeds up start-up and every app).', Graphics: 'A graphics card matters only for games and video editing.' };

async function run({ quick = false, gpu = '', dir } = {}) {
  const r = { cpu: await cpu(quick), memory: memory(quick), disk: disk(quick, dir), graphics: graphics(gpu) };
  const parts = { Processor: r.cpu.score, Memory: r.memory.score, Disk: r.disk.score, Graphics: r.graphics.score };
  const known = Object.entries(parts).filter(([, v]) => v != null); const base = Math.min(...known.map(([, v]) => v)); const weakest = known.find(([, v]) => v === base)[0];
  return { base, weakest, tip: TIPS[weakest], parts, ...r, when: Date.now(), platform: process.platform };
}
module.exports = { run, score, graphics, cpu, memory, disk };
