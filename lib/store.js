// Persistent settings for Vorynth's automation. Everything read back from disk or received from the UI is validated here.
const fs = require('fs');
const path = require('path');

const SETTINGS_KEYS = ['background', 'autostart', 'hotkeys', 'watchdog', 'notify', 'paused', 'clipboard', 'autosnap'];
const DEFAULT_SETTINGS = { background: true, autostart: false, hotkeys: true, watchdog: false, notify: true, paused: false, clipboard: false, autosnap: true };
const DEFAULTS = () => ({ rules: [], profiles: [], guard: [], notes: [], planner: [], journal: [], habits: [], ledger: [], plus: {}, snapshots: [], vault: null, addons: [], settings: { ...DEFAULT_SETTINGS }, activity: [], outages: [], organizeLog: [] });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function sanitizeWhen(w) {
  if (!w || typeof w !== 'object') return null;
  switch (w.type) {
    case 'startup': return { type: 'startup' };
    case 'power': return w.value === 'battery' || w.value === 'ac' ? { type: 'power', value: w.value } : null;
    case 'battery': return (w.op === '<' || w.op === '>=') && int(w.value, 1, 100) ? { type: 'battery', op: w.op, value: w.value } : null;
    case 'time': {
      if (!HHMM.test(w.at)) return null;
      const days = Array.isArray(w.days) ? [...new Set(w.days.filter((d) => int(d, 0, 6)))].sort() : [0, 1, 2, 3, 4, 5, 6];
      return days.length ? { type: 'time', at: w.at, days } : null;
    }
    case 'wifi': return str(w.ssid, 32) ? { type: 'wifi', ssid: w.ssid } : null;
    case 'app': return typeof w.name === 'string' && /^[\w.\- ]{1,60}$/.test(w.name) ? { type: 'app', name: w.name } : null;
    default: return null;
  }
}
function sanitizeAction(a, guardable) {
  if (!a || typeof a !== 'object') return null;
  switch (a.type) {
    case 'profile': return str(a.name, 60) ? { type: 'profile', name: a.name } : null;
    case 'volume': return int(a.value, 0, 100) ? { type: 'volume', value: a.value } : null;
    case 'mute': return typeof a.value === 'boolean' ? { type: 'mute', value: a.value } : null;
    case 'brightness': return int(a.value, 0, 100) ? { type: 'brightness', value: a.value } : null;
    case 'plan': return ['saver', 'balanced', 'high'].includes(a.match) ? { type: 'plan', match: a.match } : null;
    case 'darkMode': return typeof a.value === 'boolean' ? { type: 'darkMode', value: a.value } : null;
    case 'toggle': return guardable.includes(a.id) && typeof a.value === 'boolean' ? { type: 'toggle', id: a.id, value: a.value } : null;
    case 'keepAwake': return ['off', 'display', 'system'].includes(a.mode) && int(a.minutes ?? 0, 0, 1440) ? { type: 'keepAwake', mode: a.mode, minutes: a.minutes ?? 0 } : null;
    case 'notify': return str(a.text, 120) ? { type: 'notify', text: a.text } : null;
    case 'cleanTemp': return { type: 'cleanTemp' };
    case 'organizeDownloads': return { type: 'organizeDownloads' };
    default: return null;
  }
}
function sanitizeRule(r, guardable) {
  if (!r || typeof r !== 'object') return null;
  const when = sanitizeWhen(r.when);
  const actions = Array.isArray(r.actions) ? r.actions.slice(0, 6).map((a) => sanitizeAction(a, guardable)) : [];
  if (!when || !actions.length || actions.some((a) => a === null)) return null;
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : 'r' + Math.random().toString(36).slice(2, 10);
  return { id, name: str(r.name, 80) ? r.name : 'Rule', enabled: r.enabled !== false, when, actions };
}
function sanitizeProfile(p, guardable) {
  if (!p || typeof p !== 'object' || !str(p.name, 60)) return null;
  const out = { name: p.name, toggles: {} };
  if (p.toggles && typeof p.toggles === 'object') for (const [k, v] of Object.entries(p.toggles)) if (guardable.includes(k) && typeof v === 'boolean') out.toggles[k] = v;
  if (int(p.volume, 0, 100)) out.volume = p.volume;
  if (typeof p.muted === 'boolean') out.muted = p.muted;
  if (int(Math.round(Number(p.brightness)), 0, 100) && p.brightness != null) out.brightness = Math.round(Number(p.brightness));
  if (typeof p.plan === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.plan)) out.plan = p.plan;
  return out;
}
function sanitizeGuard(list, guardable) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(); const out = [];
  for (const g of list.slice(0, 60)) if (g && guardable.includes(g.id) && typeof g.value === 'boolean' && !seen.has(g.id)) { seen.add(g.id); out.push({ id: g.id, value: g.value }); }
  return out;
}
function sanitizeNotes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 100).filter((n) => n && typeof n.text === 'string' && n.text.trim()).map((n) => ({
    id: typeof n.id === 'string' && /^[\w-]{1,40}$/.test(n.id) ? n.id : 'n' + Math.random().toString(36).slice(2, 10),
    text: n.text.slice(0, 5000), t: Number(n.t) || Date.now(), pinned: n.pinned === true
  }));
}
function sanitizePlanner(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 500).filter((x) => x && typeof x.text === 'string' && x.text.trim() && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => ({
    id: typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : 'p' + Math.random().toString(36).slice(2, 10), date: x.date, text: x.text.slice(0, 200), done: x.done === true
  }));
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const newId = (pre, v) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : pre + Math.random().toString(36).slice(2, 10));
function sanitizeJournal(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(); const out = [];
  for (const x of list.slice(0, 2000)) { if (x && typeof x.text === 'string' && x.text.trim() && DATE.test(x.date) && !seen.has(x.date)) { seen.add(x.date); out.push({ id: newId('j', x.id), date: x.date, text: x.text.slice(0, 20000), mood: int(x.mood, 1, 5) ? x.mood : 0 }); } }
  return out;
}
function sanitizeHabits(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).filter((h) => h && str(h.name, 60)).map((h) => ({ id: newId('h', h.id), name: h.name, days: [...new Set((Array.isArray(h.days) ? h.days : []).filter((d) => typeof d === 'string' && DATE.test(d)))].sort().slice(-800) }));
}
function sanitizeLedger(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5000).filter((x) => x && DATE.test(x.date) && (x.kind === 'in' || x.kind === 'out') && Number.isFinite(Number(x.amount)) && Number(x.amount) >= 0 && Number(x.amount) <= 1e9).map((x) => ({
    id: newId('l', x.id), date: x.date, kind: x.kind, amount: Math.round(Number(x.amount) * 100) / 100, cat: typeof x.cat === 'string' ? x.cat.replace(/[\u0000-\u001f]/g, '').slice(0, 30) : '', note: typeof x.note === 'string' ? x.note.replace(/[\u0000-\u001f]/g, ' ').slice(0, 100) : ''
  }));
}
/* Generic validated lists for Vorynth Plus apps. Each field is checked; rows missing a required field are dropped; out-of-range optional numbers fall back to their minimum. */
const PLUS = {
  kanban: { max: 500, f: { title: { t: 'str', max: 120, req: 1 }, col: { t: 'int', min: 0, max: 3 }, t: { t: 'int', min: 0, max: 4e12 } } },
  snippets: { max: 300, f: { title: { t: 'str', max: 60, req: 1 }, text: { t: 'str', max: 5000, req: 1, nl: 1 } } },
  countdowns: { max: 100, f: { name: { t: 'str', max: 60, req: 1 }, date: { t: 'date', req: 1 } } },
  goals: { max: 50, f: { name: { t: 'str', max: 80, req: 1 }, target: { t: 'num', min: 0, max: 1e12 }, current: { t: 'num', min: 0, max: 1e12 }, unit: { t: 'str', max: 20 } } },
  timelog: { max: 3000, f: { task: { t: 'str', max: 80, req: 1 }, start: { t: 'int', min: 0, max: 4e12, req: 1 }, end: { t: 'int', min: 0, max: 4e12 } } },
  lists: { max: 1000, f: { title: { t: 'str', max: 120, req: 1 }, kind: { t: 'str', max: 20 }, status: { t: 'str', max: 12 }, note: { t: 'str', max: 200 } } },
  stickies: { max: 100, f: { text: { t: 'str', max: 500, nl: 1 }, color: { t: 'str', max: 12 }, x: { t: 'int', min: 0, max: 5000 }, y: { t: 'int', min: 0, max: 5000 } } },
  water: { max: 800, f: { date: { t: 'date', req: 1 }, ml: { t: 'int', min: 0, max: 20000 } } },
  cards: { max: 3000, f: { deck: { t: 'str', max: 40, req: 1 }, front: { t: 'str', max: 500, req: 1, nl: 1 }, back: { t: 'str', max: 500, req: 1, nl: 1 }, box: { t: 'int', min: 1, max: 5 }, due: { t: 'date' } } }
};
function sanitizePlus(name, list) {
  const sch = Object.prototype.hasOwnProperty.call(PLUS, name) ? PLUS[name] : null; if (!sch || !Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, sch.max)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = { id: newId('x', raw.id) }; let ok = true;
    for (const [k, d] of Object.entries(sch.f)) {
      const v = raw[k];
      if (d.t === 'str') { const t = typeof v === 'string' ? v.replace(d.nl ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g : /[\u0000-\u001f]/g, ' ').slice(0, d.max) : ''; if (d.req && !t.trim()) ok = false; row[k] = t; }
      else if (d.t === 'int') { const n = Math.round(Number(v)); if (Number.isFinite(n) && n >= d.min && n <= d.max) row[k] = n; else if (d.req) ok = false; else row[k] = d.min; }
      else if (d.t === 'num') { const n = Number(v); if (Number.isFinite(n) && n >= d.min && n <= d.max) row[k] = Math.round(n * 1e6) / 1e6; else row[k] = d.min; }
      else if (d.t === 'date') { if (typeof v === 'string' && DATE.test(v)) row[k] = v; else if (d.req) ok = false; else row[k] = ''; }
      if (!ok) break;
    }
    if (ok) out.push(row);
  }
  return out;
}
function sanitizeSnapshots(list, guardable) {
  if (!Array.isArray(list)) return [];
  return list.slice(-40).map((x) => { const p = sanitizeProfile(x, guardable); if (!p) return null; return { ...p, id: newId('s', x.id), t: Number.isFinite(Number(x.t)) ? Number(x.t) : 0, auto: x.auto === true }; }).filter(Boolean);
}
function sanitizeAddons(list) {
  if (!Array.isArray(list)) return [];
  const { validateManifest } = require('./addons'); const seen = new Set(); const out = [];
  for (const x of list.slice(0, 200)) { try { const m = validateManifest(x); if (seen.has(m.id)) continue; seen.add(m.id); out.push({ ...m, enabled: x.enabled !== false, installedAt: Number.isFinite(Number(x.installedAt)) ? Number(x.installedAt) : 0 }); } catch (_) { /* a broken record is dropped */ } }
  return out;
}
// The vault is an encrypted blob made in the UI; the store only checks that it is well-formed and not huge.
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function sanitizeVault(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.v !== 1 || !Number.isInteger(v.iter) || v.iter < 100000 || v.iter > 5000000) return null;
  if (typeof v.salt !== 'string' || v.salt.length !== 24 || !B64.test(v.salt)) return null;
  if (typeof v.iv !== 'string' || v.iv.length !== 16 || !B64.test(v.iv)) return null;
  if (typeof v.data !== 'string' || v.data.length < 24 || v.data.length > 3 * 1024 * 1024 || !B64.test(v.data)) return null;
  return { v: 1, iter: v.iter, salt: v.salt, iv: v.iv, data: v.data };
}
function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS };
  if (s && typeof s === 'object') for (const k of SETTINGS_KEYS) if (typeof s[k] === 'boolean') out[k] = s[k];
  return out;
}
const sanitizeLog = (l, keys, max) => (Array.isArray(l) ? l.slice(-max).filter((x) => x && typeof x === 'object' && keys.every((k) => k in x)) : []);

function createStore(file, guardable) {
  let data = DEFAULTS();
  const sanitizeAll = (raw) => ({
    rules: (Array.isArray(raw.rules) ? raw.rules.slice(0, 50) : []).map((r) => sanitizeRule(r, guardable)).filter(Boolean),
    profiles: (Array.isArray(raw.profiles) ? raw.profiles.slice(0, 50) : []).map((p) => sanitizeProfile(p, guardable)).filter(Boolean),
    guard: sanitizeGuard(raw.guard, guardable),
    notes: sanitizeNotes(raw.notes),
    planner: sanitizePlanner(raw.planner),
    journal: sanitizeJournal(raw.journal),
    habits: sanitizeHabits(raw.habits),
    ledger: sanitizeLedger(raw.ledger),
    snapshots: sanitizeSnapshots(raw.snapshots, guardable),
    vault: sanitizeVault(raw.vault),
    addons: sanitizeAddons(raw.addons),
    plus: Object.fromEntries(Object.keys(PLUS).map((k) => [k, sanitizePlus(k, raw.plus && raw.plus[k])])),
    settings: sanitizeSettings(raw.settings),
    activity: sanitizeLog(raw.activity, ['t', 'text'], 80).map((a) => ({ t: Number(a.t) || 0, text: String(a.text).slice(0, 200) })),
    outages: sanitizeLog(raw.outages, ['start'], 50).map((o) => ({ start: Number(o.start) || 0, end: o.end == null ? null : Number(o.end) })),
    organizeLog: Array.isArray(raw.organizeLog) ? raw.organizeLog.slice(-1000).filter((m) => m && typeof m.from === 'string' && typeof m.to === 'string') : []
  });
  const api = {
    load() { try { data = sanitizeAll(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) { data = DEFAULTS(); } return data; },
    save() { try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file); } catch (_) { /* disk full / read-only: keep running in memory */ } },
    get: () => data,
    set(key, value) {
      if (key === 'rules') data.rules = (Array.isArray(value) ? value.slice(0, 50) : []).map((r) => sanitizeRule(r, guardable)).filter(Boolean);
      else if (key === 'profiles') data.profiles = (Array.isArray(value) ? value.slice(0, 50) : []).map((p) => sanitizeProfile(p, guardable)).filter(Boolean);
      else if (key === 'guard') data.guard = sanitizeGuard(value, guardable);
      else if (key === 'notes') data.notes = sanitizeNotes(value);
      else if (key === 'planner') data.planner = sanitizePlanner(value);
      else if (key === 'journal') data.journal = sanitizeJournal(value);
      else if (key === 'habits') data.habits = sanitizeHabits(value);
      else if (key === 'ledger') data.ledger = sanitizeLedger(value);
      else if (key === 'snapshots') data.snapshots = sanitizeSnapshots(value, guardable);
      else if (key === 'addons') data.addons = sanitizeAddons(value);
      else if (key === 'vault') { if (value !== null && !sanitizeVault(value)) throw new Error('That vault data is not valid'); data.vault = value === null ? null : sanitizeVault(value); }
      else if (typeof key === 'string' && key.startsWith('plus:') && Object.prototype.hasOwnProperty.call(PLUS, key.slice(5))) { data.plus[key.slice(5)] = sanitizePlus(key.slice(5), value); api.save(); return data.plus[key.slice(5)]; }
      else if (key === 'settings') data.settings = sanitizeSettings(value);
      else throw new Error('Unknown setting group');
      api.save(); return data[key];
    },
    log(text) { data.activity.push({ t: Date.now(), text: String(text).slice(0, 200) }); if (data.activity.length > 80) data.activity.splice(0, data.activity.length - 80); api.save(); },
    setOutages(list) { data.outages = list.slice(-50); api.save(); },
    setOrganizeLog(list) { data.organizeLog = list.slice(-1000); api.save(); }
  };
  return api;
}
module.exports = { sanitizeAddons, sanitizeVault, sanitizeSnapshots, PLUS, sanitizePlus, sanitizeJournal, sanitizeHabits, sanitizeLedger, sanitizePlanner, sanitizeNotes, createStore, sanitizeRule, sanitizeWhen, sanitizeAction, sanitizeProfile, sanitizeGuard, sanitizeSettings, DEFAULT_SETTINGS };
