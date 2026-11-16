// Rules engine, settings guard and internet watchdog. All side effects are injected, so every piece is unit-testable.
const COOLDOWN_MS = 20000;
const pad = (n) => String(n).padStart(2, '0');

function conditionFor(when, sample, now) {
  switch (when.type) {
    case 'power': return sample.power === undefined ? null : sample.power === when.value;
    case 'battery': return typeof sample.battery !== 'number' ? null : when.op === '<' ? sample.battery < when.value : sample.battery >= when.value;
    case 'wifi': return sample.ssid === undefined ? null : sample.ssid === when.ssid;
    case 'app': return sample.apps === undefined ? null : sample.apps.has(when.name.toLowerCase().replace(/\.exe$/, ''));
    case 'time': { const [h, m] = when.at.split(':').map(Number); return now.getHours() === h && now.getMinutes() === m && when.days.includes(now.getDay()); }
    case 'startup': return true;
    default: return null;
  }
}

function createEngine({ store, sampler, run, clock = () => new Date(), log = () => {} }) {
  const state = {};
  async function tick() {
    const { rules, settings } = store.get();
    if (settings.paused) return { fired: [] };
    const active = rules.filter((r) => r.enabled);
    const need = new Set(active.map((r) => r.when.type)); const sample = {};
    for (const t of ['power', 'battery', 'wifi', 'app']) {
      if (!need.has(t)) continue;
      try { const key = t === 'wifi' ? 'ssid' : t === 'app' ? 'apps' : t; sample[key] = await sampler[t === 'wifi' ? 'ssid' : t === 'app' ? 'apps' : t](); } catch (_) { /* unknown this round: rule is skipped, state kept */ }
    }
    const now = clock(); const fired = [];
    for (const r of active) {
      const st = (state[r.id] ||= { prev: undefined, last: 0, minute: '', startupDone: false });
      const cond = conditionFor(r.when, sample, now);
      if (cond === null) continue;
      let fire = false;
      if (r.when.type === 'time') { const key = `${now.toDateString()} ${pad(now.getHours())}:${pad(now.getMinutes())}`; if (cond && st.minute !== key) { st.minute = key; fire = true; } }
      else if (r.when.type === 'startup') { if (!st.startupDone) { st.startupDone = true; fire = true; } }
      else if (cond && st.prev !== true && now.getTime() - st.last >= COOLDOWN_MS) fire = true;
      st.prev = cond;
      if (fire) { st.last = now.getTime(); fired.push(r.id); await execute(r); }
    }
    for (const id of Object.keys(state)) if (!rules.some((r) => r.id === id)) delete state[id]; // forget deleted rules
    return { fired };
  }
  async function execute(rule) {
    let ok = 0;
    for (const a of rule.actions) { try { await run(a); ok++; } catch (e) { log(`Rule "${rule.name}": ${a.type} failed (${String(e.message || e).slice(0, 80)})`); } }
    log(`Rule "${rule.name}" ran ${ok} of ${rule.actions.length} action${rule.actions.length === 1 ? '' : 's'}`);
    return ok;
  }
  return { tick, execute, state };
}

async function guardTick({ store, getMany, set, log = () => {}, notify = () => {} }) {
  const g = store.get().guard; if (!g.length) return { fixed: [] };
  const cur = await getMany(g.map((x) => x.id)); const fixed = [];
  for (const x of g) {
    if (cur[x.id] === undefined || cur[x.id] === x.value) continue;
    try { await set(x.id, x.value); fixed.push(x.id); } catch (e) { log(`Settings guard: could not restore ${x.id} (${String(e.message || e).slice(0, 60)})`); }
  }
  if (fixed.length) { log(`Settings guard restored ${fixed.length} setting${fixed.length === 1 ? '' : 's'}: ${fixed.join(', ')}`); notify(`Windows changed ${fixed.length} of your settings. Aurora put ${fixed.length === 1 ? 'it' : 'them'} back.`); }
  return { fixed };
}

function createWatchdog({ store, ping, now = Date.now, notify = () => {}, log = () => {} }) {
  let fails = 0, down = false, firstFail = 0; const since = now();
  const fmt = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`; };
  async function tick() {
    let ok = false; try { ok = await ping(); } catch (_) { ok = false; }
    const t = now();
    if (ok) {
      fails = 0;
      if (down) { down = false; const list = store.get().outages.slice(); const last = list[list.length - 1]; if (last && last.end == null) { last.end = t; store.setOutages(list); log(`Internet is back after ${fmt(t - last.start)}`); notify(`Internet is back (down for ${fmt(t - last.start)})`); } }
    } else {
      if (!fails) firstFail = t; fails++;
      if (!down && fails >= 2) { down = true; store.setOutages([...store.get().outages, { start: firstFail, end: null }]); log('Internet went down'); notify('Internet connection lost'); }
    }
    return { online: !down };
  }
  function status() {
    const t = now(), from = Math.max(t - 86400000, since); const outs = store.get().outages;
    const downMs = outs.reduce((a, o) => a + Math.max(0, Math.min(o.end ?? t, t) - Math.max(o.start, from)), 0);
    return { online: !down, outages: outs.slice(-20).reverse(), uptimePct: Math.max(0, Math.round((1 - downMs / Math.max(1, t - from)) * 1000) / 10), watchedMs: t - since };
  }
  return { tick, status };
}
module.exports = { createEngine, guardTick, createWatchdog, conditionFor };
