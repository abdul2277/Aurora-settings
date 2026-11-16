// Aurora Toolkit backend: network checks, LAN file sharing ("Drop"), disk speed test, PDF and ZIP tools.
// Everything here is plain Node; dialogs and the clock are injected so it can be tested without Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const tls = require('tls');
const dns = require('dns');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');

const HOST_RE = /^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const isHost = (h) => typeof h === 'string' && (HOST_RE.test(h) || net.isIP(h) > 0);
const needHost = (h) => { h = String(h || '').trim().toLowerCase(); if (!isHost(h)) throw new Error('That does not look like a website or server name'); return h; };
const needPort = (p) => { const n = Number(p); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('A port is a number from 1 to 65535'); return n; };

/* ---------- network checks ---------- */
const DNS_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'];
async function netDns({ host, type = 'A' }, resolver = dns.promises) {
  host = needHost(host); type = String(type).toUpperCase(); if (!DNS_TYPES.includes(type)) throw new Error('Unsupported record type');
  const t0 = Date.now();
  try {
    const raw = await resolver.resolve(host, type);
    const records = (Array.isArray(raw) ? raw : [raw]).map((r) => (typeof r === 'string' ? r : Array.isArray(r) ? r.join('') : type === 'MX' ? `${r.priority} ${r.exchange}` : type === 'SOA' ? `${r.nsname} ${r.hostmaster} serial ${r.serial}` : JSON.stringify(r)));
    return { host, type, records, ms: Date.now() - t0 };
  } catch (e) {
    if (/ENODATA|ENOTFOUND/.test(e.code || '')) return { host, type, records: [], ms: Date.now() - t0, note: e.code === 'ENOTFOUND' ? 'No such name' : 'No ' + type + ' records' };
    throw new Error('DNS lookup failed: ' + (e.code || e.message));
  }
}
const portGate = { last: 0 };
async function netPort({ host, port, timeout = 3000 }, now = Date.now) {
  host = needHost(host); port = needPort(port); timeout = Math.max(500, Math.min(10000, Number(timeout) || 3000));
  if (now() - portGate.last < 800) throw new Error('Please wait a moment between port checks');
  portGate.last = now();
  return new Promise((resolve) => {
    const t0 = Date.now(); const s = net.connect({ host, port }); let done = false;
    const fin = (open, why) => { if (done) return; done = true; s.destroy(); resolve({ host, port, open, ms: Date.now() - t0, why }); };
    s.setTimeout(timeout); s.on('connect', () => fin(true, 'connected')); s.on('timeout', () => fin(false, 'no answer (blocked or offline)')); s.on('error', (e) => fin(false, e.code === 'ECONNREFUSED' ? 'refused (nothing is listening)' : e.code || e.message));
  });
}
function netSsl({ host, port = 443, rejectUnauthorized = false }, now = Date.now) {
  host = needHost(host); port = needPort(port);
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized }, () => {
      const c = s.getPeerCertificate(); const authorized = s.authorized; const err = s.authorizationError; s.end();
      if (!c || !c.valid_to) return reject(new Error('The server did not present a certificate'));
      const to = new Date(c.valid_to), from = new Date(c.valid_from);
      resolve({ host, port, subject: (c.subject && (c.subject.CN || '')) || '', issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || '', validFrom: from.toISOString(), validTo: to.toISOString(), daysLeft: Math.floor((to - now()) / 86400000), authorized, problem: authorized ? '' : String(err || ''), san: String(c.subjectaltname || '').split(', ').slice(0, 20), protocol: s.getProtocol && s.getProtocol() });
    });
    s.setTimeout(8000, () => { s.destroy(); reject(new Error('The server did not answer in time')); }); s.on('error', (e) => reject(new Error('Could not connect: ' + (e.code || e.message))));
  });
}
async function netHeaders({ url }, fetchFn = fetch) {
  let u; try { u = new URL(String(url)); } catch (_) { try { u = new URL('https://' + String(url)); } catch (__) { throw new Error('That is not a valid web address'); } }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses can be checked');
  const chain = []; let cur = u.href;
  for (let i = 0; i < 6; i++) {
    const t0 = Date.now(); const res = await fetchFn(cur, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'AuroraNetKit/1.0', range: 'bytes=0-0' }, signal: AbortSignal.timeout(10000) });
    const headers = {}; res.headers.forEach((v, k) => { headers[k] = String(v).slice(0, 300); }); try { await res.body?.cancel?.(); } catch (_) {}
    chain.push({ url: cur, status: res.status, ms: Date.now() - t0, headers });
    const loc = res.headers.get('location'); if (res.status >= 300 && res.status < 400 && loc) { try { const nx = new URL(loc, cur); if (!/^https?:$/.test(nx.protocol)) break; cur = nx.href; continue; } catch (_) { break; } }
    break;
  }
  return { chain };
}
async function netPublicIp(fetchFn = fetch) { const r = await fetchFn('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('The lookup service did not answer'); const j = await r.json(); if (!net.isIP(j.ip)) throw new Error('Unexpected answer'); return { ip: j.ip }; }
const MAC_RE = /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i;
function wolPacket(mac) { if (!MAC_RE.test(String(mac))) throw new Error('A MAC address looks like AA:BB:CC:DD:EE:FF'); const b = Buffer.from(String(mac).replace(/[:-]/g, ''), 'hex'); return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(b)]); }
async function netWol({ mac, address = '255.255.255.255', port = 9 }) {
  const pkt = wolPacket(mac); if (net.isIPv4(address) === false) throw new Error('Bad broadcast address'); port = needPort(port);
  return new Promise((resolve, reject) => { const s = dgram.createSocket('udp4'); s.once('error', (e) => { try { s.close(); } catch (_) {} reject(new Error('Could not send: ' + (e.code || e.message))); }); s.bind(() => { s.setBroadcast(true); s.send(pkt, port, address, (e) => { s.close(); e ? reject(new Error('Could not send: ' + e.message)) : resolve({ sent: pkt.length }); }); }); });
}

/* ---------- Drop: share one file over the local network ---------- */
function lanAddresses(ifaces = os.networkInterfaces()) { const out = []; for (const [name, list] of Object.entries(ifaces)) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({ name, address: a.address }); return out; }
// encrypt = true (default): the file is encrypted with a fresh random key BEFORE it is served (lib/e2ee.js). The link carries the key and the
// file name in its #fragment, which browsers never send over the network, so the server and anyone watching the LAN only ever see ciphertext.
function createDrop({ addresses = lanAddresses, ttlMs = 15 * 60000, now = Date.now, tmpDir = os.tmpdir() } = {}) {
  let state = null;
  const stop = () => { if (!state) return false; clearTimeout(state.timer); try { state.server.close(); state.server.closeAllConnections?.(); } catch (_) {} if (state.tmpFile) { try { fs.rmSync(state.tmpFile, { force: true }); } catch (_) {} } state = null; return true; };
  const status = () => (state ? { active: true, name: state.name, size: state.size, urls: state.urls, downloads: state.downloads, endsAt: state.endsAt, once: state.once, encrypted: !!state.encrypted, fingerprint: state.fingerprint || '' } : { active: false });
  async function start({ file, once = true, encrypt = true }) {
    const e2ee = require('./e2ee'); const { viewerPage } = require('./e2ee-browser');
    const st = fs.statSync(file); if (!st.isFile()) throw new Error('Pick a file, not a folder'); const ips = addresses(); if (!ips.length) throw new Error('This PC is not connected to a network');
    stop(); const token = crypto.randomBytes(16).toString('hex'); const name = path.basename(file); const safe = name.replace(/[^\w.\- ()]/g, '_');
    let serveFile = file, serveSize = st.size, key = null, tmpFile = null;
    if (encrypt) { // encrypt first, so nothing readable is ever on the network
      key = e2ee.newKey(); tmpFile = path.join(tmpDir, 'aurora-drop-' + crypto.randomBytes(8).toString('hex') + '.aur');
      try { e2ee.encryptFileSync(file, tmpFile, key); } catch (e) { try { fs.rmSync(tmpFile, { force: true }); } catch (_) {} throw new Error('Could not encrypt the file: ' + e.message); }
      serveFile = tmpFile; serveSize = fs.statSync(tmpFile).size;
    }
    const blobName = 'f.aur'; const page = encrypt ? viewerPage({ blobPath: blobName, size: serveSize }) : '';
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x'); const base = '/' + token + '/';
      const isBlob = encrypt ? u.pathname === base + blobName : (u.pathname === base + encodeURIComponent(safe) || u.pathname === base + safe);
      if (req.method === 'GET' && encrypt && u.pathname === base) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }); return res.end(page); }
      if (req.method !== 'GET' || !isBlob) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
      let rs; try { rs = fs.createReadStream(serveFile); } catch (_) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': serveSize, 'content-disposition': `attachment; filename="${encrypt ? blobName : safe}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      let sent = 0; rs.on('data', (c) => { sent += c.length; }); rs.pipe(res); res.on('close', () => { if (state && sent >= serveSize) { state.downloads++; if (state.once) setTimeout(stop, 300); } }); rs.on('error', () => res.destroy());
    });
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); }); } catch (e) { if (tmpFile) { try { fs.rmSync(tmpFile, { force: true }); } catch (_) {} } throw e; }
    const port = server.address().port; const frag = key ? '#k=' + e2ee.b64u(key) + '&n=' + e2ee.b64u(Buffer.from(name, 'utf8')) : '';
    state = { server, name, size: st.size, once: !!once, downloads: 0, endsAt: now() + ttlMs, encrypted: encrypt, tmpFile, fingerprint: key ? e2ee.fingerprint(key) : '',
      urls: ips.map((a) => encrypt ? `http://${a.address}:${port}/${token}/${frag}` : `http://${a.address}:${port}/${token}/${encodeURIComponent(safe)}`), timer: setTimeout(stop, ttlMs) };
    state.timer.unref?.(); return status();
  }
  return { start, stop, status };
}

/* ---------- disk speed ---------- */
async function diskSpeed({ sizeMB = 128, dir = os.tmpdir() } = {}) {
  sizeMB = Math.round(Number(sizeMB)); if (!(sizeMB >= 16 && sizeMB <= 1024)) throw new Error('Pick a size from 16 to 1024 MB');
  const file = path.join(dir, 'aurora-speed-' + crypto.randomBytes(5).toString('hex') + '.tmp'); const chunk = crypto.randomBytes(4 * 1024 * 1024); const n = Math.ceil(sizeMB * 1048576 / chunk.length);
  try {
    const fd = fs.openSync(file, 'w'); const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fs.writeSync(fd, chunk); fs.fsyncSync(fd); const w = Number(process.hrtime.bigint() - t0) / 1e9; fs.closeSync(fd);
    const total = n * chunk.length; const rfd = fs.openSync(file, 'r'); const buf = Buffer.alloc(chunk.length); const t1 = process.hrtime.bigint(); let got = 0; for (;;) { const r = fs.readSync(rfd, buf, 0, buf.length, got); if (!r) break; got += r; } const rd = Number(process.hrtime.bigint() - t1) / 1e9; fs.closeSync(rfd);
    return { sizeMB: Math.round(total / 1048576), writeMBps: Math.round(total / 1048576 / Math.max(w, 1e-3)), readMBps: Math.round(total / 1048576 / Math.max(rd, 1e-3)), note: 'Reads may be served from memory, so the read number can look higher than the drive really is.' };
  } finally { try { fs.rmSync(file, { force: true }); } catch (_) {} }
}

/* ---------- PDF (pdf-lib) ---------- */
function parseRanges(spec, total) {
  const out = []; const seen = new Set(); const s = String(spec || '').replace(/\s+/g, '');
  if (!s) throw new Error('Type the pages you want, for example 1-3,5');
  for (const part of s.split(',')) { const m = /^(\d+)(?:-(\d+))?$/.exec(part); if (!m) throw new Error(`"${part}" is not a page or range`); const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; if (a < 1 || b < a || b > total) throw new Error(`Pages must be between 1 and ${total}`); for (let p = a; p <= b; p++) if (!seen.has(p)) { seen.add(p); out.push(p - 1); } }
  return out;
}
async function pdfInfo(file) { const { PDFDocument } = require('pdf-lib'); const bytes = fs.readFileSync(file); if (bytes.length > 300 * 1048576) throw new Error('That PDF is too large for this tool (300 MB limit)'); let doc; try { doc = await PDFDocument.load(bytes); } catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'This PDF is password-protected, so Aurora cannot change it' : 'That does not look like a valid PDF'); } return { pages: doc.getPageCount(), size: bytes.length, title: doc.getTitle() || '' }; }
async function pdfMerge(files) { const { PDFDocument } = require('pdf-lib'); if (!Array.isArray(files) || files.length < 2 || files.length > 100) throw new Error('Pick 2 to 100 PDFs to join'); const out = await PDFDocument.create(); for (const f of files) { let d; try { d = await PDFDocument.load(fs.readFileSync(f)); } catch (_) { throw new Error(`"${path.basename(f)}" could not be read as a PDF`); } (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); } return Buffer.from(await out.save()); }
async function pdfExtract(file, spec) { const { PDFDocument } = require('pdf-lib'); const src = await PDFDocument.load(fs.readFileSync(file)); const idx = parseRanges(spec, src.getPageCount()); const out = await PDFDocument.create(); (await out.copyPages(src, idx)).forEach((p) => out.addPage(p)); return Buffer.from(await out.save()); }
async function pdfRotate(file, degrees, spec) { const { PDFDocument, degrees: deg } = require('pdf-lib'); if (![90, 180, 270].includes(Number(degrees))) throw new Error('Rotate by 90, 180 or 270 degrees'); const doc = await PDFDocument.load(fs.readFileSync(file)); const idx = spec ? parseRanges(spec, doc.getPageCount()) : doc.getPageIndices(); idx.forEach((i) => { const p = doc.getPage(i); p.setRotation(deg((p.getRotation().angle + Number(degrees)) % 360)); }); return Buffer.from(await doc.save()); }
async function pdfSplitAll(file) { const { PDFDocument } = require('pdf-lib'); const src = await PDFDocument.load(fs.readFileSync(file)); const n = src.getPageCount(); if (n > 500) throw new Error('Too many pages to split at once (limit 500)'); const parts = []; for (let i = 0; i < n; i++) { const o = await PDFDocument.create(); const [p] = await o.copyPages(src, [i]); o.addPage(p); parts.push(Buffer.from(await o.save())); } return parts; }

/* ---------- ZIP (adm-zip) ---------- */
const ZIP_LIMITS = { entries: 100000, bytes: 4 * 1024 ** 3, ratio: 1000 };
function zipList(file) { const AdmZip = require('adm-zip'); const z = new AdmZip(file); const es = z.getEntries(); return { count: es.length, entries: es.slice(0, 500).map((e) => ({ name: e.entryName, size: e.header.size, dir: e.isDirectory })), truncated: es.length > 500, total: es.reduce((a, e) => a + e.header.size, 0) }; }
function zipCreate(paths, outFile) {
  const AdmZip = require('adm-zip'); const z = new AdmZip(); let files = 0, bytes = 0;
  const add = (p, base) => { const st = fs.lstatSync(p); if (st.isSymbolicLink()) return; if (st.isDirectory()) { z.addFile(base + '/', Buffer.alloc(0)); for (const n of fs.readdirSync(p)) add(path.join(p, n), base + '/' + n); } else if (st.isFile()) { files++; bytes += st.size; if (files > 20000 || bytes > 4 * 1024 ** 3) throw new Error('That is too much to zip at once'); z.addLocalFile(p, path.dirname(base) === '.' ? '' : path.dirname(base), path.basename(base)); } };
  for (const p of paths) add(p, path.basename(p)); if (!files) throw new Error('There is nothing to put in the zip'); z.writeZip(outFile); return { files, bytes };
}
function zipExtract(file, destDir) {
  const AdmZip = require('adm-zip'); const z = new AdmZip(file); const es = z.getEntries(); if (es.length > ZIP_LIMITS.entries) throw new Error('This zip has too many files');
  const root = path.resolve(destDir); let total = 0;
  for (const e of es) { total += e.header.size; if (total > ZIP_LIMITS.bytes) throw new Error('This zip would unpack to more than 4 GB, so Aurora stopped'); if (e.header.compressedSize > 0 && e.header.size / e.header.compressedSize > ZIP_LIMITS.ratio && e.header.size > 100 * 1048576) throw new Error('This zip looks like a zip bomb, so it was not unpacked'); const t = path.resolve(root, e.entryName); if (t !== root && !t.startsWith(root + path.sep)) throw new Error('This zip contains an unsafe file path, so nothing was unpacked'); }
  fs.mkdirSync(root, { recursive: true }); let n = 0;
  for (const e of es) { const t = path.resolve(root, e.entryName); if (e.isDirectory) { fs.mkdirSync(t, { recursive: true }); continue; } fs.mkdirSync(path.dirname(t), { recursive: true }); if (fs.existsSync(t)) { const ext = path.extname(t); let k = 1, alt; do { alt = t.slice(0, t.length - ext.length) + ` (${k++})` + ext; } while (fs.existsSync(alt)); fs.writeFileSync(alt, e.getData()); } else fs.writeFileSync(t, e.getData()); n++; }
  return { files: n, dir: root };
}
module.exports = { isHost, netDns, netPort, netSsl, netHeaders, netPublicIp, netWol, wolPacket, lanAddresses, createDrop, diskSpeed, parseRanges, pdfInfo, pdfMerge, pdfExtract, pdfRotate, pdfSplitAll, zipList, zipCreate, zipExtract, ZIP_LIMITS };
