/* GPU monitor data: NVIDIA via nvidia-smi (Windows/Linux), plus local Ollama models. Original code. */
const { execFile } = require('child_process');
const http = require('http');
const sh = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 4000, windowsHide: true }, (e, out) => res(e ? '' : String(out))));
const n = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
const GPU_Q = 'name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.sm';
function parseGpus(txt) {
  return String(txt).split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).filter((p) => p.length >= 9).map((p) => ({
    name: p[0], util: n(p[1]), memUtil: n(p[2]), vramUsedMB: n(p[3]), vramTotalMB: n(p[4]), tempC: n(p[5]), powerW: n(p[6]), powerLimitW: n(p[7]), smMHz: n(p[8]) }));
}
function parseProcs(txt) {
  const m = new Map();
  String(txt).split(/\r?\n/).forEach((l) => { const p = l.split(',').map((x) => x.trim()); if (p.length >= 3 && /^\d+$/.test(p[0])) { const k = +p[0]; const e = m.get(k) || { pid: k, name: p[1].split(/[\\/]/).pop(), vramMB: 0 }; e.vramMB += n(p[2]) || 0; m.set(k, e); } });
  return [...m.values()].sort((a, b) => b.vramMB - a.vramMB);
}
function ollama(port = 11434) {
  return new Promise((res) => {
    const rq = http.get({ host: '127.0.0.1', port, path: '/api/ps', timeout: 600 }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res((JSON.parse(b).models || []).map((m) => ({ server: 'Ollama', model: m.name, sizeMB: Math.round((m.size || 0) / 1048576), vramMB: Math.round((m.size_vram || 0) / 1048576), context: m.context_length || null }))); } catch (_) { res([]); } }); });
    rq.on('error', () => res([])); rq.on('timeout', () => { rq.destroy(); res([]); });
  });
}
async function collect(opts = {}) {
  const smi = opts.smi || 'nvidia-smi';
  const [g, p, llm] = await Promise.all([sh(smi, ['--query-gpu=' + GPU_Q, '--format=csv,noheader,nounits']), sh(smi, ['--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader,nounits']), ollama(opts.ollamaPort)]);
  return { time: Date.now(), gpus: parseGpus(g), processes: parseProcs(p), llm };
}
module.exports = { collect, parseGpus, parseProcs };
