'use strict';
/* Vorynth Launcher core: the logic of the Raycast-style command bar. Pure Node, no Electron, so it can be tested on its own.
   Everything here is free and works offline except currency rates (frankfurter.app, no key) and the optional local AI (Ollama). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/* ---------------- safe calculator (no eval) ---------------- */
function calc(src) {
  let s = String(src).toLowerCase().trim();
  if (!s || s.length > 200) return null;
  s = s.replace(/(\d)\s*%\s*of\s*([\d.]+)/g, '($1/100*$2)').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)').replace(/×/g, '*').replace(/÷/g, '/').replace(/\bx\b/g, '*').replace(/,(?=\d{3}\b)/g, '').replace(/\bmod\b/g, '%');
  if (!/^[\d\s+\-*/^().,%a-z]+$/.test(s)) return null;
  if (!/[\d]/.test(s)) return null;
  if (!/[+\-*/^%]|sqrt|sin|cos|tan|log|ln|abs|round|floor|ceil|pi\b|\be\b|fact/.test(s) ) return null; // a bare number is not a calculation
  const toks = []; const re = /\s*(\d+(?:\.\d+)?|\.\d+|[a-z]+|[+\-*/^%(),])/y; let m; let pos = 0;
  while (pos < s.length) { re.lastIndex = pos; m = re.exec(s); if (!m) { if (/^\s*$/.test(s.slice(pos))) break; return null; } toks.push(m[1]); pos = re.lastIndex; }
  let i = 0;
  const FN = { sqrt: Math.sqrt, sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180), log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, fact: (n) => { if (n < 0 || n > 170 || n !== Math.floor(n)) throw new Error('x'); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; } };
  const CONST = { pi: Math.PI, e: Math.E };
  const peek = () => toks[i]; const next = () => toks[i++];
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(); const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = pow(); while (peek() === '*' || peek() === '/' || peek() === '%') { const o = next(); const r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function pow() { const b = unary(); if (peek() === '^') { next(); return Math.pow(b, pow()); } return b; }
  function unary() { if (peek() === '-') { next(); return -unary(); } if (peek() === '+') { next(); return unary(); } return atom(); }
  function atom() {
    const t = next(); if (t === undefined) throw new Error('x');
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('x'); return v; }
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (Object.prototype.hasOwnProperty.call(CONST, t)) return CONST[t];
    if (Object.prototype.hasOwnProperty.call(FN, t)) { if (next() !== '(') throw new Error('x'); const v = expr(); if (next() !== ')') throw new Error('x'); return FN[t](v); }
    throw new Error('x');
  }
  try { const v = expr(); if (i !== toks.length || !Number.isFinite(v)) return null; return v; } catch (_) { return null; }
}
const fmtNum = (v) => { if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toLocaleString('en-US'); const a = Math.abs(v); return a >= 1e15 || (a < 1e-6 && a > 0) ? v.toExponential(6) : String(parseFloat(v.toPrecision(12))); };

/* ---------------- unit conversion ---------------- */
const U = {};
const add = (cat, base, defs) => { for (const [names, f] of defs) for (const n of names.split(' ')) U[n] = { cat, f }; };
add('length', 'm', [['m meter meters metre metres', 1], ['km kilometer kilometers', 1000], ['cm centimeter centimeters', 0.01], ['mm millimeter millimeters', 0.001], ['mi mile miles', 1609.344], ['yd yard yards', 0.9144], ['ft foot feet', 0.3048], ['in inch inches', 0.0254], ['nm nmi', 1852]]);
add('mass', 'kg', [['kg kilogram kilograms kilo kilos', 1], ['g gram grams', 0.001], ['mg milligram milligrams', 0.000001], ['lb lbs pound pounds', 0.45359237], ['oz ounce ounces', 0.0283495231], ['t ton tons tonne tonnes', 1000], ['st stone', 6.35029318]]);
add('volume', 'l', [['l liter liters litre litres', 1], ['ml milliliter milliliters', 0.001], ['gal gallon gallons', 3.785411784], ['qt quart quarts', 0.946352946], ['pt pint pints', 0.473176473], ['cup cups', 0.2365882365], ['floz', 0.0295735296], ['tbsp', 0.0147867648], ['tsp', 0.00492892159]]);
add('data', 'b', [['b byte bytes', 1], ['kb', 1e3], ['mb', 1e6], ['gb', 1e9], ['tb', 1e12], ['pb', 1e15], ['kib', 1024], ['mib', 1048576], ['gib', 1073741824], ['tib', 1099511627776], ['bit bits', 0.125], ['kbit', 125], ['mbit', 125000], ['gbit', 125000000]]);
add('time', 's', [['s sec secs second seconds', 1], ['ms millisecond milliseconds', 0.001], ['min mins minute minutes', 60], ['h hr hrs hour hours', 3600], ['d day days', 86400], ['wk week weeks', 604800], ['mo month months', 2629800], ['yr year years', 31557600]]);
add('speed', 'ms', [['mps', 1], ['kmh kph', 0.277777778], ['mph', 0.44704], ['knot knots kn', 0.514444444]]);
add('area', 'm2', [['m2 sqm', 1], ['km2', 1e6], ['cm2', 0.0001], ['ha hectare hectares', 10000], ['acre acres', 4046.8564224], ['ft2 sqft', 0.09290304], ['mi2', 2589988.110336]]);
const TEMP = { c: 1, celsius: 1, f: 1, fahrenheit: 1, k: 1, kelvin: 1 };
const toC = (v, u) => (u === 'f' || u === 'fahrenheit' ? (v - 32) * 5 / 9 : u === 'k' || u === 'kelvin' ? v - 273.15 : v);
const fromC = (v, u) => (u === 'f' || u === 'fahrenheit' ? v * 9 / 5 + 32 : u === 'k' || u === 'kelvin' ? v + 273.15 : v);
function convert(q) {
  const m = String(q).trim().toLowerCase().match(/^(-?[\d.,]+)\s*°?\s*([a-z0-9]+)\s+(?:to|in|into|as|->|=)\s+°?\s*([a-z0-9]+)$/); if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, '')); const a = m[2]; const b = m[3]; if (!Number.isFinite(v)) return null;
  if (TEMP[a] && TEMP[b]) { const r = fromC(toC(v, a), b); return { value: r, text: `${fmtNum(v)} ${a.toUpperCase()} = ${fmtNum(parseFloat(r.toFixed(4)))} ${b.toUpperCase()}`, copy: String(parseFloat(r.toFixed(4))) }; }
  const A = U[a]; const B = U[b]; if (!A || !B || A.cat !== B.cat) return null;
  const r = v * A.f / B.f; return { value: r, text: `${fmtNum(v)} ${a} = ${fmtNum(r)} ${b}`, copy: String(parseFloat(r.toPrecision(10))) };
}
const CUR = new Set('usd eur gbp jpy sar aed kwd qar bhd omr egp inr pkr cny cad aud chf try rub brl mxn zar sgd hkd krw nzd sek nok dkk pln thb idr myr php vnd ils czk huf'.split(' '));
function parseCurrency(q) {
  const m = String(q).trim().toLowerCase().match(/^([\d.,]+)\s*([a-z]{3})\s+(?:to|in|into|->|=)\s+([a-z]{3})$/); if (!m) return null;
  if (!CUR.has(m[2]) || !CUR.has(m[3])) return null; const amount = parseFloat(m[1].replace(/,/g, '')); if (!Number.isFinite(amount)) return null;
  return { amount, from: m[2].toUpperCase(), to: m[3].toUpperCase() };
}

/* ---------------- colours ---------------- */
function parseColor(q) {
  const s = String(q).trim().toLowerCase(); let r; let g; let b; let m;
  if ((m = s.match(/^#?([0-9a-f]{6})$/)) && (s[0] === '#' || /[a-f]/.test(m[1]) )) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
  else if ((m = s.match(/^#([0-9a-f]{3})$/))) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
  else if ((m = s.match(/^rgb\(?\s*(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})\s*\)?$/))) { r = +m[1]; g = +m[2]; b = +m[3]; if (r > 255 || g > 255 || b > 255) return null; }
  else return null;
  const rn = r / 255; const gn = g / 255; const bn = b / 255; const mx = Math.max(rn, gn, bn); const mn = Math.min(rn, gn, bn); const l = (mx + mn) / 2; let h = 0; let sat = 0;
  if (mx !== mn) { const d = mx - mn; sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : mx === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4; h *= 60; }
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { hex, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%)`, r, g, b };
}

/* ---------------- small utilities (uuid, password, hashes ...) ---------------- */
function utility(q) {
  const m = String(q).match(/^(\w+)(?:\s+([\s\S]+))?$/); if (!m) return null; const cmd = m[1].toLowerCase(); const arg = (m[2] || '').trim(); const out = [];
  const put = (title, value, sub) => out.push({ title: String(value).length > 90 ? String(value).slice(0, 90) + '…' : String(value), sub: sub || title, copy: String(value) });
  switch (cmd) {
    case 'slug': if (arg) put('Slug', arg.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'URL slug'); break;
    case 'camel': if (arg) { const w = arg.split(/[^A-Za-z0-9]+/).filter(Boolean).map((x) => x.toLowerCase()); put('camelCase', w.map((x, i) => i ? x[0].toUpperCase() + x.slice(1) : x).join(''), 'camelCase'); put('snake_case', w.join('_'), 'snake_case'); put('kebab-case', w.join('-'), 'kebab-case'); put('PascalCase', w.map((x) => x[0].toUpperCase() + x.slice(1)).join(''), 'PascalCase'); } break;
    case 'words': case 'wc': if (arg) { const w = arg.split(/\s+/).filter(Boolean).length; put(w + ' words', w + ' words, ' + arg.length + ' characters', 'Word count'); } break;
    case 'lorem': { const n = Math.min(200, Math.max(1, parseInt(arg, 10) || 30)); const base = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' '); const w = []; for (let i = 0; i < n; i++) w.push(base[i % base.length]); const t = w.join(' '); put('Lorem ipsum', t[0].toUpperCase() + t.slice(1) + '.', n + ' placeholder words'); break; }
    case 'dice': case 'roll': { const m2 = (arg || '1d6').match(/^(\d{1,2})d(\d{1,4})$/i); if (m2) { const k = +m2[1], f = +m2[2]; const r = []; for (let i = 0; i < k; i++) r.push(crypto.randomInt(1, f + 1)); put('Rolled ' + r.reduce((a, b) => a + b, 0), r.join(' + ') + ' = ' + r.reduce((a, b) => a + b, 0), k + 'd' + f); } break; }
    case 'coin': case 'flip': put('Coin', crypto.randomInt(0, 2) ? 'Heads' : 'Tails', 'Coin flip'); break;
    case 'pick': case 'choose': { const o = arg.split(/\s*[,|]\s*/).filter(Boolean); if (o.length > 1) { const w = o[crypto.randomInt(0, o.length)]; put('Picked: ' + w, w, 'Random choice from your list'); } break; }
    case 'random': case 'rand': { const m2 = arg.match(/^(-?\d+)\s*[- ,]\s*(-?\d+)$/); if (m2) { const a = +m2[1], b = +m2[2]; if (b > a) put('Random', crypto.randomInt(a, b + 1), 'Random whole number from ' + a + ' to ' + b); } break; }
    case 'bytes': case 'size': { const n = parseFloat(arg); if (isFinite(n)) { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let v = n, i = 0; while (v >= 1024 && i < 4) { v /= 1024; i++; } put(v.toFixed(2).replace(/\.00$/, '') + ' ' + u[i], v.toFixed(2) + ' ' + u[i], 'Bytes made readable'); } break; }
    case 'epoch': case 'unix': { const n = parseFloat(arg); if (isFinite(n)) { const d = new Date(n < 1e11 ? n * 1000 : n); if (!isNaN(d)) put(d.toISOString(), d.toISOString(), 'Unix time to date'); } else if (!arg) put(String(Math.floor(Date.now() / 1000)), String(Math.floor(Date.now() / 1000)), 'Current Unix time'); break; }
    case 'color': case 'hex2rgb': { const h = arg.replace('#', ''); if (/^[0-9a-f]{6}$/i.test(h)) { const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4), 16); put('rgb(' + r + ', ' + g + ', ' + b + ')', 'rgb(' + r + ', ' + g + ', ' + b + ')', 'Colour #' + h); } break; }
    case 'rgb2hex': { const m2 = arg.match(/^(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})$/); if (m2) put('#' + [m2[1], m2[2], m2[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join(''), '#' + [m2[1], m2[2], m2[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join(''), 'RGB to hex'); break; }
    case 'bmi': { const m2 = arg.match(/^([\d.]+)\s*(?:kg)?[ ,\/]+([\d.]+)\s*(?:cm)?$/i); if (m2) { const kg = +m2[1]; let h = +m2[2]; if (h > 3) h /= 100; const v = kg / (h * h); put('BMI ' + v.toFixed(1), v.toFixed(1), 'Weight in kg, height in cm'); } break; }
    case 'roman': { const n = parseInt(arg, 10); if (n > 0 && n < 4000) { let r = ''; let x = n; [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].forEach(([v, c]) => { while (x >= v) { r += c; x -= v; } }); put(r, r, 'Roman numeral'); } break; }
    case 'morse': if (arg) { const M = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' }; put('Morse', arg.toLowerCase().split('').map((ch) => ch === ' ' ? '/' : (M[ch] || '')).filter(Boolean).join(' '), 'Morse code'); } break;
    case 'bin2text': { const b = arg.replace(/\s+/g, ''); if (/^[01]+$/.test(b) && b.length % 8 === 0) put('Text', b.match(/.{8}/g).map((x) => String.fromCharCode(parseInt(x, 2))).join(''), 'Binary to text'); break; }
    case 'text2bin': if (arg) put('Binary', arg.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' '), 'Text to binary'); break;
    case 'days': { const d = new Date(arg); if (arg && !isNaN(d)) { const n = Math.round((d - new Date(new Date().toDateString())) / 864e5); put(Math.abs(n) + ' days ' + (n >= 0 ? 'from now' : 'ago'), Math.abs(n) + ' days ' + (n >= 0 ? 'from now' : 'ago'), 'Until / since ' + arg); } break; }
    case 'http': case 'status': { const H = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict', 418: "I'm a teapot", 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' }; if (H[arg]) put(arg + ' ' + H[arg], arg + ' ' + H[arg], 'HTTP status code'); break; }
    case 'chmod': { const m2 = arg.match(/^[0-7]{3}$/); if (m2) { const r = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']; put(arg.split('').map((d) => r[+d]).join(''), arg.split('').map((d) => r[+d]).join(''), 'chmod ' + arg + ' as permissions'); } else { const m3 = arg.match(/^([r-][w-][x-]){3}$/); if (m3) put(arg.match(/.{3}/g).map((t) => (t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + (t[2] === 'x' ? 1 : 0)).join(''), arg.match(/.{3}/g).map((t) => (t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + (t[2] === 'x' ? 1 : 0)).join(''), 'Permissions as chmod number'); } break; }
    case 'subnet': case 'cidr': { const m2 = arg.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d{1,2})$/); if (m2 && +m2[5] <= 32) { const bits = +m2[5]; const ip = ((+m2[1] << 24) | (+m2[2] << 16) | (+m2[3] << 8) | +m2[4]) >>> 0; const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; const net = (ip & mask) >>> 0; const bc = (net | ~mask) >>> 0; const f = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); put(f(net) + ' – ' + f(bc), f(net) + ' - ' + f(bc), 'Mask ' + f(mask) + ', ' + (bits >= 31 ? 2 ** (32 - bits) : 2 ** (32 - bits) - 2) + ' usable hosts'); } break; }
    case 'luhn': { const d = arg.replace(/\D/g, ''); if (d.length > 5) { let sum = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } put(sum % 10 === 0 ? 'Valid (Luhn)' : 'Not valid', sum % 10 === 0 ? 'Valid (Luhn)' : 'Not valid', 'Card-number checksum only, nothing is sent anywhere'); } break; }
    case 'htmlesc': if (arg) put('HTML escaped', arg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), 'HTML escaped'); break;
    case 'htmlunesc': if (arg) put('HTML unescaped', arg.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), 'HTML unescaped'); break;
    case 'jsonmin': if (arg) { try { put('Minified', JSON.stringify(JSON.parse(arg)), 'Minified JSON'); } catch (_) { put('Not valid JSON', 'Not valid JSON', 'Check the commas and quotes'); } } break;
    case 'regex': { const m2 = arg.match(/^\/(.+)\/([gimsu]*)\s+([\s\S]+)$/); if (m2) { try { const r = [...m2[3].matchAll(new RegExp(m2[1], m2[2].includes('g') ? m2[2] : m2[2] + 'g'))].map((x) => x[0]); put(r.length + ' match' + (r.length === 1 ? '' : 'es'), r.join(', ') || 'none', 'Usage: regex /pattern/flags text'); } catch (e) { put('Bad pattern', e.message, 'Regex error'); } } break; }
    case 'cron': { const f = arg.split(/\s+/); if (f.length === 5) { const [mi, h, dom, mo, dw] = f; const parts = []; if (mi === '*' && h === '*') parts.push('every minute'); else if (/^\*\/\d+$/.test(mi) && h === '*') parts.push('every ' + mi.slice(2) + ' minutes'); else if (/^\d+$/.test(mi) && /^\d+$/.test(h)) parts.push('at ' + h.padStart(2, '0') + ':' + mi.padStart(2, '0')); else parts.push('minute ' + mi + ', hour ' + h); if (dom !== '*') parts.push('on day ' + dom + ' of the month'); if (mo !== '*') parts.push('in month ' + mo); if (dw !== '*') { const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; parts.push('on ' + dw.split(',').map((x) => D[+x % 7] || x).join(', ')); } put(parts.join(', '), parts.join(', '), 'Cron explained'); } break; }
    case 'time': case 'tz': case 'zone': { if (arg) { try { const t = new Date().toLocaleString('en-GB', { timeZone: arg.replace(/\s+/g, '_'), dateStyle: 'medium', timeStyle: 'short' }); put(t, t, 'Time in ' + arg); } catch (_) { /* unknown zone */ } } break; }
    case 'ascii': if (arg) put('Character codes', arg.split('').slice(0, 30).map((c) => c.charCodeAt(0)).join(' '), 'Character codes'); break;
    case 'unicode': if (arg) put('Code points', [...arg].slice(0, 20).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' '), 'Unicode code points'); break;
    case 'initials': if (arg) put('Initials', arg.split(/\s+/).map((w) => w[0].toUpperCase()).join(''), 'Initials'); break;
    case 'repeat': { const m2 = arg.match(/^(\d{1,3})\s+([\s\S]+)$/); if (m2) put('Repeated', Array(+m2[1]).fill(m2[2]).join(' '), m2[1] + ' times'); break; }
    case 'shuffle': if (arg) { const a = arg.split(/\s+/); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } put('Shuffled', a.join(' '), 'Words in random order'); } break;
    case 'leet': if (arg) put('1337', arg.replace(/[aeiost]/gi, (c) => ({ a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' })[c.toLowerCase()]), 'Leetspeak'); break;
    case 'mock': if (arg) put('mOcKiNg', arg.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''), 'Mocking case'); break;
    case 'flip2': if (arg) put('Flipped', arg.split('').reverse().join(''), 'Reversed'); break;
    case 'uuid': case 'guid': put('UUID', crypto.randomUUID(), 'New UUID. Enter copies it'); break;
    case 'pass': case 'password': { const n = Math.min(128, Math.max(6, parseInt(arg, 10) || 20)); const cs = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+'; let p = ''; for (let i = 0; i < n; i++) p += cs[crypto.randomInt(cs.length)]; put('Password', p, `Strong random password (${n} characters). Enter copies it`); break; }
    case 'b64': case 'base64': if (arg) put('Base64', Buffer.from(arg, 'utf8').toString('base64'), 'Base64 of your text'); break;
    case 'unb64': if (arg) { try { const t = Buffer.from(arg, 'base64').toString('utf8'); if (t) put('Decoded', t, 'Base64 decoded'); } catch (_) { /* ignore */ } } break;
    case 'sha256': case 'sha1': case 'sha512': case 'md5': if (arg) put(cmd.toUpperCase(), crypto.createHash(cmd).update(arg).digest('hex'), cmd.toUpperCase() + ' of your text'); break;
    case 'urlenc': if (arg) put('URL encoded', encodeURIComponent(arg), 'URL encoded'); break;
    case 'urldec': if (arg) { try { put('URL decoded', decodeURIComponent(arg), 'URL decoded'); } catch (_) { /* ignore */ } } break;
    case 'upper': if (arg) put('UPPERCASE', arg.toUpperCase(), 'Upper case'); break;
    case 'lower': if (arg) put('lowercase', arg.toLowerCase(), 'Lower case'); break;
    case 'slug': if (arg) put('Slug', arg.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), 'URL-friendly text'); break;
    case 'count': if (arg) put(`${arg.length} characters, ${arg.split(/\s+/).filter(Boolean).length} words`, `${arg.length} characters, ${arg.split(/\s+/).filter(Boolean).length} words`, 'Text counter'); break;
    case 'epoch': case 'unix': { const n = Number(arg); if (arg && Number.isFinite(n)) { const d = new Date(n < 1e11 ? n * 1000 : n); if (!Number.isNaN(d.getTime())) put('Date', d.toString(), 'Unix time to date'); } else put('Unix time now', Math.floor(Date.now() / 1000), 'Seconds since 1970'); break; }
    case 'now': case 'date': put('Now', new Date().toString(), 'Current date and time. ISO: ' + new Date().toISOString()); break;
    case 'rand': case 'random': { const p = arg.split(/[\s,-]+/).map(Number); const lo = Number.isFinite(p[0]) ? p[0] : 1; const hi = Number.isFinite(p[1]) ? p[1] : 100; if (hi > lo) put('Random number', lo + crypto.randomInt(Math.min(hi - lo + 1, 2 ** 31)), `Random number from ${lo} to ${hi}`); break; }
    case 'flip': case 'coin': put('Coin flip', crypto.randomInt(2) ? 'Heads' : 'Tails', 'Coin flip'); break;
    case 'dice': case 'roll': put('Dice', 1 + crypto.randomInt(6), 'Six-sided die'); break;
    case 'lorem': put('Lorem ipsum', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'Placeholder text'); break;
    case 'title': if (arg) put('Title Case', arg.toLowerCase().replace(/(^|\s)(\S)/g, (_, a2, b2) => a2 + b2.toUpperCase()), 'Title case'); break;
    case 'reverse': if (arg) put('Reversed', [...arg].reverse().join(''), 'Text reversed'); break;
    case 'rot13': if (arg) put('ROT13', arg.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)), 'ROT13'); break;
    case 'hex': case 'bin': case 'dec': case 'oct': { const t = arg.replace(/^0x/i, ''); const base = /^0x/i.test(arg) ? 16 : (/^0b/i.test(arg) ? 2 : 10); const n = base === 2 ? parseInt(arg.slice(2), 2) : parseInt(t, base); if (arg && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER) { out.push({ title: 'Hex 0x' + n.toString(16).toUpperCase(), sub: 'Decimal ' + n + '  ·  Binary ' + n.toString(2) + '  ·  Octal ' + n.toString(8), copy: '0x' + n.toString(16).toUpperCase() }); out.push({ title: 'Binary ' + n.toString(2), sub: 'Enter copies', copy: n.toString(2) }); out.push({ title: 'Decimal ' + n, sub: 'Enter copies', copy: String(n) }); } break; }
    case 'json': if (arg) { try { put('JSON (pretty)', JSON.stringify(JSON.parse(arg), null, 2), 'Valid JSON, formatted. Enter copies'); } catch (e) { put('Not valid JSON', 'Not valid JSON: ' + e.message.slice(0, 60), 'Check commas and quotes'); out[out.length - 1].copy = arg; } } break;
    case 'jwt': if (arg) { const parts = arg.split('.'); if (parts.length >= 2) { try { const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); const pl = dec(parts[1]); const hd = dec(parts[0]); const exp = pl.exp ? ' · expires ' + new Date(pl.exp * 1000).toISOString() : ''; out.push({ title: 'Payload: ' + JSON.stringify(pl).slice(0, 80), sub: 'Header ' + JSON.stringify(hd) + exp + ' (not verified, only decoded)', copy: JSON.stringify(pl, null, 2) }); } catch (_) { /* not a token */ } } } break;
    case 'age': { const d = new Date(arg); if (arg && !Number.isNaN(d.getTime()) && d < new Date()) { const n = new Date(); let y = n.getFullYear() - d.getFullYear(); let mo = n.getMonth() - d.getMonth(); let da = n.getDate() - d.getDate(); if (da < 0) { mo--; da += 30; } if (mo < 0) { y--; mo += 12; } put(`${y} years, ${mo} months, ${da} days`, `${y} years, ${mo} months, ${da} days`, 'Age since ' + arg + '  (' + Math.floor((n - d) / 86400000) + ' days)'); } break; }
    case 'tip': { const m2 = arg.match(/^([\d.]+)\s*(?:at|@)?\s*(\d+)?%?$/); if (m2) { const bill = parseFloat(m2[1]); const pct = parseInt(m2[2] || '15', 10); const t2 = bill * pct / 100; put(`Tip ${fmtNum(+t2.toFixed(2))}, total ${fmtNum(+(bill + t2).toFixed(2))}`, (bill + t2).toFixed(2), `${pct}% tip on ${bill}. Enter copies the total`); } break; }
    default: return null;
  }
  return out.length ? out : null;
}
// "days until 2027-01-01", "days since 2020-05-01", "2026-12-25 - today"
function dateMath(q) {
  const m = String(q).trim().match(/^days?\s+(until|to|since|from)\s+(\d{4}-\d{2}-\d{2})$/i); if (!m) return null;
  const d = new Date(m[2] + 'T00:00:00'); if (Number.isNaN(d.getTime())) return null; const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((d - t) / 86400000); const until = /^(until|to)$/i.test(m[1]);
  const days = until ? n : -n; return { text: until ? (days >= 0 ? `${days} days until ${m[2]}` : `${m[2]} was ${-days} days ago`) : (days >= 0 ? `${days} days since ${m[2]}` : `${m[2]} is ${-days} days away`), copy: String(Math.abs(days)) };
}

/* ---------------- quicklinks ---------------- */
const QUICKLINKS = [
  { key: 'g', name: 'Google', url: 'https://www.google.com/search?q={q}' }, { key: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}' },
  { key: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}' }, { key: 'gh', name: 'GitHub', url: 'https://github.com/search?q={q}' },
  { key: 'maps', name: 'Google Maps', url: 'https://www.google.com/maps/search/{q}' }, { key: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={q}' },
  { key: 'so', name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q={q}' }, { key: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q={q}' },
  { key: 'mdn', name: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/search?q={q}' }, { key: 'amazon', name: 'Amazon', url: 'https://www.amazon.com/s?k={q}' },
  { key: 'tr', name: 'Google Translate', url: 'https://translate.google.com/?sl=auto&tl=en&text={q}&op=translate' }, { key: 'imdb', name: 'IMDb', url: 'https://www.imdb.com/find/?q={q}' },
  { key: 'steam', name: 'Steam store', url: 'https://store.steampowered.com/search/?term={q}' }, { key: 'proton', name: 'ProtonDB (does it run on Linux?)', url: 'https://www.protondb.com/search?q={q}' },
  { key: 'flathub', name: 'Flathub', url: 'https://flathub.org/apps/search?q={q}' }, { key: 'winget', name: 'winget packages', url: 'https://winget.run/search?query={q}' },
  { key: 'chatgpt', name: 'Ask ChatGPT', url: 'https://chatgpt.com/?q={q}' }, { key: 'claude', name: 'Ask Claude', url: 'https://claude.ai/new?q={q}' },
  { key: 'perplexity', name: 'Ask Perplexity', url: 'https://www.perplexity.ai/search?q={q}' }, { key: 'gemini', name: 'Ask Gemini', url: 'https://gemini.google.com/app' }
];
const SAFE_URL = /^https?:\/\//i;
const buildUrl = (tpl, q) => String(tpl).replace('{q}', encodeURIComponent(q || ''));

/* ---------------- emoji ---------------- */
const EMOJI = '😀 grin smile happy|😂 laugh lol joy tears|🤣 rofl funny|😊 blush smile|😍 love heart eyes|😘 kiss|😎 cool sunglasses|🤔 think hmm|😅 sweat nervous|😭 cry sob|😢 sad tear|😡 angry mad|🥳 party celebrate|😴 sleep tired|🤯 mind blown|😇 angel|🙃 upside silly|😉 wink|🥰 loving|🤗 hug|🙄 eyeroll|😬 grimace|🤩 starstruck|😱 scream shock|🥺 pleading|😤 huff|🤝 handshake deal|👍 thumbs up yes ok|👎 thumbs down no|👏 clap|🙏 pray thanks please|💪 strong muscle|✌️ peace victory|🤞 fingers crossed luck|👌 ok perfect|👋 wave hello bye|🫡 salute|🔥 fire hot lit|✨ sparkles magic|⭐ star|🌟 glowing star|💯 hundred perfect|❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|💔 broken heart|🎉 party popper tada|🎂 birthday cake|🎁 gift present|🏆 trophy win|🥇 gold medal first|⚽ soccer football|🏀 basketball|🎮 game controller gaming|🎵 music note|🎧 headphones|📱 phone|💻 laptop computer|⌨️ keyboard|🖥️ desktop monitor|🖱️ mouse|💡 idea bulb light|🔒 lock secure|🔑 key|⚙️ gear settings|🔧 wrench tool|🛠️ tools|📁 folder|📄 document page|📝 note memo write|📌 pin|📎 paperclip|✅ check done yes|❌ cross no wrong|⚠️ warning caution|❓ question|❗ exclamation|🚀 rocket launch fast|🌍 earth world globe|🌙 moon night crescent|☀️ sun sunny|⛅ cloud sun|🌧️ rain|❄️ snow cold|⚡ lightning bolt fast power|🌈 rainbow|🍕 pizza|🍔 burger|🍟 fries|🍣 sushi|🍎 apple red|🍌 banana|🍓 strawberry|☕ coffee tea hot|🍵 green tea|🥤 drink soda|🍺 beer|🐱 cat|🐶 dog|🦊 fox|🐼 panda|🦁 lion|🐢 turtle|🦄 unicorn|🐧 penguin linux|🌹 rose flower|🌸 blossom|🌳 tree|🏠 house home|🚗 car|✈️ airplane flight|🚲 bike|⏰ alarm clock time|⌛ hourglass|📅 calendar date|📊 chart graph|💰 money bag|💵 dollar cash|💎 gem diamond|🕌 mosque|🕋 kaaba mecca|☪️ star crescent islam|📿 prayer beads tasbih|🌙 ramadan crescent|🕯️ candle|🤲 palms up dua|📖 book quran read|🇸🇦 saudi arabia flag|🇦🇪 uae flag|🇺🇸 usa flag|🇬🇧 uk flag|🔍 search magnifier|🔔 bell notification|🔕 mute bell|🔊 speaker loud|🔇 mute speaker|🔋 battery|📶 signal wifi|🗑️ trash bin delete|♻️ recycle|🧠 brain smart|👀 eyes look|🫶 heart hands|💀 skull dead|👻 ghost|🤖 robot ai|👽 alien|🎯 target bullseye|🧩 puzzle|🎨 art palette paint|📷 camera photo|🎬 movie clapper|📺 tv|🔗 link chain|🧪 test tube experiment|🛡️ shield protect|🏁 finish flag race|➡️ arrow right|⬅️ arrow left|⬆️ arrow up|⬇️ arrow down|➕ plus add|➖ minus|✖️ multiply|➗ divide|©️ copyright|™️ trademark|→ arrow right text|← arrow left text|✓ check mark text|✗ x mark text|… ellipsis|— em dash|° degree|€ euro|£ pound|¥ yen|₿ bitcoin|× times|÷ divide sign|≈ approx|≠ not equal|∞ infinity|π pi|µ micro|½ half|¼ quarter'.split('|').map((l) => { const i = l.indexOf(' '); return { ch: l.slice(0, i), kw: l.slice(i + 1) }; });

/* ---------------- fuzzy matching + ranking ---------------- */
function fuzzy(q, text) {
  q = q.toLowerCase(); const t = text.toLowerCase(); if (!q) return 1;
  if (q.length > 2 && !/[\s\-_.]/.test(q)) { const tt = t.replace(/[\s\-_.]+/g, ''); if (tt === q) return 98; if (tt.startsWith(q)) return 88; }
  if (t === q) return 100; if (t.startsWith(q)) return 90 - Math.min(20, t.length - q.length) * 0.2;
  const wi = t.split(/[\s\-_.()]+/).findIndex((w) => w.startsWith(q)); if (wi >= 0) return 75 - wi * 2;
  const idx = t.indexOf(q); if (idx >= 0) return 60 - Math.min(20, idx) * 0.5;
  // initials: "vsc" matches "Visual Studio Code"
  const words = t.split(/[\s\-_.()]+/).filter(Boolean); if (words.map((w) => w[0]).join('').startsWith(q)) return 55;
  let qi = 0; let streak = 0; let score = 0; for (let i = 0; i < t.length && qi < q.length; i++) { if (t[i] === q[qi]) { qi++; streak++; score += 2 + streak; } else streak = 0; }
  return qi === q.length && q.length >= 2 ? Math.min(45, 10 + score * 0.6) : 0;
}

/* ---------------- apps index ---------------- */
function readDesktopFile(file) {
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  const sec = txt.split(/\n\s*\n/)[0]; const g = (k) => { const m = sec.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : ''; };
  if (!/\[Desktop Entry\]/.test(sec) || g('Type') !== 'Application' || /^true$/i.test(g('NoDisplay')) || /^true$/i.test(g('Hidden'))) return null;
  const name = g('Name'); if (!name) return null;
  return { id: 'app:' + path.basename(file), title: name, sub: g('Comment') || g('GenericName') || 'Application', keywords: (g('Keywords') + ' ' + g('GenericName')).toLowerCase(), file, exec: g('Exec'), terminal: /^true$/i.test(g('Terminal')), kind: 'app' };
}
function scanLinuxApps(env = process.env, home = os.homedir()) {
  const dirs = ['/usr/share/applications', '/usr/local/share/applications', '/var/lib/flatpak/exports/share/applications', path.join(home, '.local/share/flatpak/exports/share/applications'), path.join(home, '.local/share/applications'), '/var/lib/snapd/desktop/applications'];
  const seen = new Map();
  for (const d of dirs) { let fl; try { fl = fs.readdirSync(d); } catch (_) { continue; } for (const f of fl) if (f.endsWith('.desktop')) { const a = readDesktopFile(path.join(d, f)); if (a) seen.set(f, a); } }
  return [...seen.values()];
}
function scanWindowsLnks(env = process.env) {
  const roots = [path.join(env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  const out = new Map();
  const walk = (d, depth) => { let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) { if (depth < 4) walk(p, depth + 1); } else if (/\.lnk$/i.test(e.name) && !/uninstall|readme|license|help|website|documentation/i.test(e.name)) { const title = e.name.replace(/\.lnk$/i, ''); if (!out.has(title.toLowerCase())) out.set(title.toLowerCase(), { id: 'app:' + title.toLowerCase(), title, sub: 'Application', keywords: '', file: p, kind: 'app' }); } } };
  for (const r of roots) if (r) walk(r, 0);
  return [...out.values()];
}

/* ---------------- system commands + window management + settings pages ---------------- */
const SYS = [
  { id: 'sys:lock', title: 'Lock screen', sub: 'Lock this PC', kw: 'lock screen', icon: '🔒' },
  { id: 'sys:sleep', title: 'Sleep', sub: 'Put the PC to sleep', kw: 'sleep suspend', icon: '🌙' },
  { id: 'sys:restart', title: 'Restart', sub: 'Restart now (asks again before doing it)', kw: 'restart reboot', icon: '🔄', confirm: true },
  { id: 'sys:shutdown', title: 'Shut down', sub: 'Turn the PC off (asks again before doing it)', kw: 'shutdown power off turn off', icon: '⏻', confirm: true },
  { id: 'sys:signout', title: 'Sign out', sub: 'Log out of this account (asks again)', kw: 'sign out log out logoff', icon: '🚪', confirm: true },
  { id: 'sys:trash', title: 'Empty recycle bin / trash', sub: 'Permanently deletes what is in it (asks again)', kw: 'empty trash recycle bin', icon: '🗑️', confirm: true },
  { id: 'sys:taskmgr', title: 'Task manager', sub: 'See running programs and close frozen ones', kw: 'task manager processes kill frozen', icon: '📈' },
  { id: 'sys:screenshot', title: 'Take a screenshot', sub: 'Pick an area to capture', kw: 'screenshot snip capture screen', icon: '📸' },
  { id: 'sys:emoji', title: 'Emoji picker (system)', sub: 'Open the system emoji panel', kw: 'emoji', icon: '😀' },
  { id: 'sys:calc', title: 'Calculator app', sub: 'Open the calculator program', kw: 'calculator calc', icon: '🧮' },
  { id: 'sys:terminal', title: 'Open a terminal', sub: 'Command line', kw: 'terminal cmd powershell console shell', icon: '⌨️' },
  { id: 'sys:update', title: 'Update everything', sub: 'Windows Update / system, apps and firmware', kw: 'update upgrade windows update', icon: '⬆️' },
  { id: 'sys:settings', title: 'System settings', sub: 'Open the system Settings app', kw: 'settings control panel preferences', icon: '⚙️' }
];
const WIN_PAGES = [['Display settings', 'ms-settings:display'], ['Sound settings', 'ms-settings:sound'], ['Bluetooth devices', 'ms-settings:bluetooth'], ['Wi-Fi', 'ms-settings:network-wifi'], ['Network and internet', 'ms-settings:network'], ['Apps and features', 'ms-settings:appsfeatures'], ['Startup apps', 'ms-settings:startupapps'], ['Default apps', 'ms-settings:defaultapps'], ['Personalization', 'ms-settings:personalization'], ['Dark / light mode', 'ms-settings:colors'], ['Power and battery', 'ms-settings:powersleep'], ['Storage', 'ms-settings:storagesense'], ['Windows Update', 'ms-settings:windowsupdate'], ['Privacy and security', 'ms-settings:privacy'], ['Windows Security', 'windowsdefender:'], ['Date and time', 'ms-settings:dateandtime'], ['Language and region', 'ms-settings:regionlanguage'], ['Notifications', 'ms-settings:notifications'], ['Gaming / Game Mode', 'ms-settings:gaming-gamemode'], ['About this PC', 'ms-settings:about']];
const WINDOW_ACTS = [
  ['win:left', 'Window: left half', '◧'], ['win:right', 'Window: right half', '◨'], ['win:top', 'Window: top half', '⬒'], ['win:bottom', 'Window: bottom half', '⬓'],
  ['win:max', 'Window: maximize', '⬛'], ['win:center', 'Window: center', '◼'], ['win:almost', 'Window: almost maximize', '▣'], ['win:tl', 'Window: top-left quarter', '◰'], ['win:tr', 'Window: top-right quarter', '◳'],
  ['win:bl', 'Window: bottom-left quarter', '◱'], ['win:br', 'Window: bottom-right quarter', '◲'], ['win:third1', 'Window: left third', '▌'], ['win:third2', 'Window: middle third', '▐'], ['win:third3', 'Window: right third', '▐'], ['win:next', 'Window: move to next screen', '🖥️']
];
// rectangle for a window action inside a work area {x,y,width,height}
function windowRect(act, wa) {
  const { x, y, width: w, height: h } = wa; const hw = Math.floor(w / 2); const hh = Math.floor(h / 2); const t = Math.floor(w / 3);
  switch (act) {
    case 'win:left': return { x, y, width: hw, height: h }; case 'win:right': return { x: x + hw, y, width: w - hw, height: h };
    case 'win:top': return { x, y, width: w, height: hh }; case 'win:bottom': return { x, y: y + hh, width: w, height: h - hh };
    case 'win:max': return { x, y, width: w, height: h }; case 'win:center': { const ww = Math.floor(w * 0.6); const hhh = Math.floor(h * 0.7); return { x: x + Math.floor((w - ww) / 2), y: y + Math.floor((h - hhh) / 2), width: ww, height: hhh }; }
    case 'win:almost': { const ww = Math.floor(w * 0.9); const hhh = Math.floor(h * 0.9); return { x: x + Math.floor((w - ww) / 2), y: y + Math.floor((h - hhh) / 2), width: ww, height: hhh }; }
    case 'win:tl': return { x, y, width: hw, height: hh }; case 'win:tr': return { x: x + hw, y, width: w - hw, height: hh };
    case 'win:bl': return { x, y: y + hh, width: hw, height: h - hh }; case 'win:br': return { x: x + hw, y: y + hh, width: w - hw, height: h - hh };
    case 'win:third1': return { x, y, width: t, height: h }; case 'win:third2': return { x: x + t, y, width: t, height: h }; case 'win:third3': return { x: x + 2 * t, y, width: w - 2 * t, height: h };
    default: return null;
  }
}

/* ---------------- stored data (settings, snippets, notes, todos, usage) ---------------- */
const DEFAULTS = () => ({ hotkey: '', quicklinks: [], snippets: [{ name: 'Today (date)', trigger: 'date', text: '{date}' }, { name: 'Email signature', trigger: 'sig', text: 'Best regards,' }], notes: [], todos: [], usage: {}, ollamaModel: '', files: true, clipboard: true, ai: true });
function createData(file) {
  let d = DEFAULTS();
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j && typeof j === 'object' && !Array.isArray(j)) d = { ...d, ...j }; } catch (_) { /* first run */ }
  for (const k of ['quicklinks', 'snippets', 'notes', 'todos']) if (!Array.isArray(d[k])) d[k] = DEFAULTS()[k];
  if (!d.usage || typeof d.usage !== 'object') d.usage = {};
  let tm = null;
  const save = () => { clearTimeout(tm); tm = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(d)); fs.renameSync(file + '.tmp', file); } catch (_) { /* never crash for this */ } }, 250); };
  const flush = () => { clearTimeout(tm); try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(d)); } catch (_) { /* ignore */ } };
  return {
    get: () => d, save, flush,
    bump(id) { const u = d.usage[id] || { n: 0, t: 0 }; u.n++; u.t = Date.now(); d.usage[id] = u; const ks = Object.keys(d.usage); if (ks.length > 600) { ks.sort((a, b) => d.usage[a].t - d.usage[b].t).slice(0, 100).forEach((k) => delete d.usage[k]); } save(); },
    boost(id) { const u = d.usage[id]; if (!u) return 0; const ageDays = (Date.now() - u.t) / 86400000; return Math.min(25, Math.log2(1 + u.n) * 6) * (ageDays < 7 ? 1 : ageDays < 30 ? 0.7 : 0.4); },
    addNote(text) { const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: String(text).slice(0, 5000), t: Date.now() }; d.notes.unshift(n); d.notes = d.notes.slice(0, 500); save(); return n; },
    delNote(id) { d.notes = d.notes.filter((n) => n.id !== id); save(); },
    addTodo(text) { const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: String(text).slice(0, 500), done: false, t: Date.now() }; d.todos.unshift(n); d.todos = d.todos.slice(0, 500); save(); return n; },
    toggleTodo(id) { const t = d.todos.find((x) => x.id === id); if (t) { t.done = !t.done; save(); } },
    delTodo(id) { d.todos = d.todos.filter((x) => x.id !== id); save(); },
    addSnippet(name, text, trigger) { const tr = (trigger || name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20); d.snippets = d.snippets.filter((s) => s.trigger !== tr); d.snippets.unshift({ name: String(name).slice(0, 60), trigger: tr, text: String(text).slice(0, 20000) }); save(); },
    delSnippet(trigger) { d.snippets = d.snippets.filter((s) => s.trigger !== trigger); save(); },
    addQuicklink(key, name, url) { if (!SAFE_URL.test(url) || !/^[a-z0-9]{1,12}$/.test(key)) throw new Error('A quicklink needs a short key (letters/numbers) and an address starting with https://'); d.quicklinks = d.quicklinks.filter((q) => q.key !== key); d.quicklinks.unshift({ key, name: String(name).slice(0, 40) || key, url }); save(); },
    delQuicklink(key) { d.quicklinks = d.quicklinks.filter((q) => q.key !== key); save(); }
  };
}
function expandSnippet(text, { clipboard = '' } = {}) {
  const n = new Date(); const pad = (x) => String(x).padStart(2, '0');
  return String(text).replace(/\{(date|time|datetime|clipboard|uuid|year)\}/g, (_, k) => k === 'date' ? `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}` : k === 'time' ? `${pad(n.getHours())}:${pad(n.getMinutes())}` : k === 'datetime' ? `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}` : k === 'year' ? String(n.getFullYear()) : k === 'uuid' ? crypto.randomUUID() : clipboard);
}
function parseDuration(s) {
  const m = String(s).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)?$/); if (!m) return null; const n = parseFloat(m[1]); const u = (m[2] || 'm')[0];
  const ms = u === 's' ? n * 1000 : u === 'h' ? n * 3600000 : n * 60000; return ms >= 1000 && ms <= 86400000 ? ms : null;
}

/* ---------------- the query engine ---------------- */
// ctx: { platform, apps:[...], data, clipboardItems:[...], timers:[...], scripts:[...], hasAI }
function search(q, ctx) {
  q = String(q || '').replace(/\s+/g, ' ').trimStart(); const raw = q.trim(); const R = []; const D = ctx.data.get(); const platform = ctx.platform;
  const push = (r) => R.push(r);
  if (!raw) { // empty box: recently used things first
    const recent = [...ctx.apps, ...SYS.map((s) => ({ ...s, kind: 'sys', sub: s.sub }))].map((a) => ({ a, b: ctx.data.boost(a.id) })).filter((x) => x.b > 0).sort((x, y) => y.b - x.b).slice(0, 7);
    for (const { a } of recent) push(a.kind === 'app' ? { id: a.id, title: a.title, sub: a.sub, group: 'Recent', kind: 'app', app: a, score: 50 } : { id: a.id, title: a.title, sub: a.sub, group: 'Recent', icon: a.icon, kind: 'sys', confirm: !!a.confirm, score: 50 });
    push({ id: 'help:tip', title: 'Type to search apps, files, calculate, convert, run commands', sub: 'Try: 5*12   10 km to mi   100 usd to sar   cb   snip   note hello   timer 10m   emoji fire   ai why is the sky blue', group: 'Tips', icon: '💡', kind: 'noop', score: 1 });
    return R;
  }
  const low = raw.toLowerCase(); const first = low.split(' ')[0]; const rest = raw.slice(first.length).trim();
  // answers
  const c = calc(raw); if (c !== null) push({ id: 'ans:calc', title: fmtNum(c), sub: `${raw} =  Enter copies the answer`, group: 'Calculator', icon: '🧮', kind: 'copy', copy: String(parseFloat(c.toPrecision(14))), big: true, score: 200 });
  const cv = convert(raw); if (cv) push({ id: 'ans:conv', title: cv.text, sub: 'Unit conversion. Enter copies the number', group: 'Convert', icon: '🔁', kind: 'copy', copy: cv.copy, big: true, score: 199 });
  const cur = parseCurrency(raw); if (cur) push({ id: 'ans:cur', title: `${fmtNum(cur.amount)} ${cur.from} → ${cur.to}`, sub: 'Getting today\'s rate...', group: 'Currency', icon: '💱', kind: 'currency', cur, big: true, score: 198 });
  const col = parseColor(raw); if (col) push({ id: 'ans:color', title: col.hex, sub: `${col.rgb}   ${col.hsl}`, group: 'Colour', icon: '🎨', kind: 'copy', copy: col.hex, swatch: col.hex, big: true, score: 197, alts: [col.rgb, col.hsl] });
  const dm = dateMath(raw); if (dm) push({ id: 'ans:date', title: dm.text, sub: 'Date maths', group: 'Date', icon: '📅', kind: 'copy', copy: dm.copy, big: true, score: 196 });
  const ut = utility(raw); if (ut) ut.forEach((u, i) => push({ id: 'ans:util' + i, title: u.title, sub: u.sub, group: 'Tools', icon: '🧰', kind: 'copy', copy: u.copy, big: true, score: 195 }));
  // timers
  if (first === 'timer' && rest) { const m = rest.match(/^(\S+)\s*(.*)$/); const ms = m && parseDuration(m[1]); if (ms) push({ id: 'timer:new', title: `Start a ${m[1]} timer${m[2] ? ' for "' + m[2] + '"' : ''}`, sub: 'You get a notification when it ends', group: 'Timer', icon: '⏱️', kind: 'timer', ms, label: m[2] || '', score: 190 }); }
  if (first === 'timers' || first === 'timer') for (const t of ctx.timers || []) push({ id: 'timer:' + t.id, title: `${t.label || 'Timer'}: ${Math.max(0, Math.round((t.at - Date.now()) / 1000))}s left`, sub: 'Enter cancels this timer', group: 'Timers', icon: '⏳', kind: 'timercancel', tid: t.id, score: 150 });
  // notes and todos
  if (first === 'note' && rest) push({ id: 'note:new', title: `Save note: ${rest.slice(0, 80)}`, sub: 'Quick note, kept on this PC', group: 'Notes', icon: '📝', kind: 'noteadd', text: rest, score: 185 });
  if (first === 'notes' || first === 'note') for (const n of D.notes.filter((n) => !rest || first === 'notes' ? (!rest || n.text.toLowerCase().includes(rest.toLowerCase())) : false).slice(0, 8)) push({ id: 'note:' + n.id, title: n.text.slice(0, 90), sub: 'Note. Enter copies it, Ctrl+Enter deletes it', group: 'Notes', icon: '📝', kind: 'copy', copy: n.text, alt: { kind: 'notedel', nid: n.id }, score: 120 });
  if (first === 'todo' && rest) push({ id: 'todo:new', title: `Add to-do: ${rest.slice(0, 80)}`, sub: 'Your to-do list', group: 'To-do', icon: '☑️', kind: 'todoadd', text: rest, score: 185 });
  if (first === 'todos' || first === 'todo') for (const t of D.todos.filter((t) => !rest || first === 'todos' ? (!rest || t.text.toLowerCase().includes(rest.toLowerCase())) : false).slice(0, 10)) push({ id: 'todo:' + t.id, title: (t.done ? '✔ ' : '○ ') + t.text, sub: 'Enter ticks it off, Ctrl+Enter deletes it', group: 'To-do', icon: '☑️', kind: 'todotoggle', tid: t.id, alt: { kind: 'tododel', tid: t.id }, score: 120 });
  // snippets
  if (first === 'snip' || first === 'snippet' || first === 'snippets') {
    const am = rest.match(/^add\s+(\S+)\s*=\s*([\s\S]+)$/i); if (am) push({ id: 'snip:new', title: `Create snippet "${am[1]}"`, sub: 'Text: ' + am[2].slice(0, 70) + '   (can use {date} {time} {clipboard} {uuid})', group: 'Snippets', icon: '✂️', kind: 'snipadd', name: am[1], text: am[2], score: 185 });
    else if (/^add/i.test(rest) || !rest) push({ id: 'snip:help', title: 'Create one:  snip add name = the text you want pasted', sub: 'Placeholders: {date} {time} {datetime} {clipboard} {uuid}', group: 'Snippets', icon: '✂️', kind: 'noop', score: 100 });
    for (const s of D.snippets.filter((s) => !rest || /^add/i.test(rest) || s.name.toLowerCase().includes(rest.toLowerCase()) || s.trigger.includes(rest.toLowerCase())).slice(0, 10)) push({ id: 'snip:' + s.trigger, title: s.name, sub: s.text.replace(/\s+/g, ' ').slice(0, 80) + '   · Enter pastes, Ctrl+Enter deletes', group: 'Snippets', icon: '✂️', kind: 'snippaste', text: s.text, alt: { kind: 'snipdel', trigger: s.trigger }, score: 140 });
  } else for (const s of D.snippets) if (s.trigger === low) push({ id: 'snipx:' + s.trigger, title: `Paste snippet: ${s.name}`, sub: s.text.replace(/\s+/g, ' ').slice(0, 80), group: 'Snippets', icon: '✂️', kind: 'snippaste', text: s.text, score: 180 });
  // clipboard
  { const fx = first === 'fx' || first === 'clipfx' ? rest.toLowerCase().split(' ')[0] : ''; if (first === 'fx' || first === 'clipfx') { const names = ['upper', 'lower', 'title', 'sort', 'uniq', 'trim', 'reverse', 'lines', 'count', 'json', 'single', 'quote', 'plain']; const txt = String(ctx.clipText || ''); if (!txt) push({ id: 'fx:none', title: 'Your clipboard has no text', sub: 'Copy some text first, then type  fx upper  (or lower, title, sort, uniq, trim, json, count...)', group: 'Clipboard tools', icon: '🧪', kind: 'noop', score: 190 }); else for (const n of names.filter((x) => !fx || x.startsWith(fx))) { const r = transformText(n, txt); if (r != null) push({ id: 'fx:' + n, title: `${n}: ` + String(r).replace(/\s+/g, ' ').slice(0, 80), sub: 'Transforms the text you copied. Enter puts the result on your clipboard', group: 'Clipboard tools', icon: '🧪', kind: 'copy', copy: String(r), score: 190 }); } } }
  { const pm = raw.match(/^([\d.,]+)\s*%\s*(?:of|من)\s*([\d.,]+)$/i); if (pm) { const a3 = parseFloat(pm[1].replace(/,/g, '')); const b3 = parseFloat(pm[2].replace(/,/g, '')); if (Number.isFinite(a3) && Number.isFinite(b3)) push({ id: 'ans:pct', title: fmtNum(+(a3 * b3 / 100).toPrecision(12)), sub: `${a3}% of ${b3}. Enter copies`, group: 'Calculator', icon: '🧮', kind: 'copy', copy: String(+(a3 * b3 / 100).toPrecision(12)), big: true, score: 201 }); } }
  if (['kill', 'port', 'ip', 'wifipass', 'wifi'].includes(first) && (first !== 'wifi' || /^pass/i.test(rest))) push({ id: 'dyn:hint', title: first === 'kill' ? `Looking for processes named "${rest}"...` : first === 'port' ? `Checking what uses port ${rest}...` : first === 'ip' ? 'Your IP addresses' : 'Saved Wi-Fi passwords', sub: 'One moment', group: 'System', icon: '🛠️', kind: 'noop', score: 185, dyn: first === 'wifi' ? 'wifipass' : first });
  if (first === 'awake' || first === 'caffeinate' || first === 'keepawake') push({ id: 'awake:t', title: ctx.awake ? 'Let the PC sleep again' : 'Keep this PC awake (screen and sleep)', sub: ctx.awake ? 'Keep-awake is on now' : 'Stops the screen and sleep from turning off until you switch it off', group: 'Tools', icon: '☕', kind: 'awake', value: !ctx.awake, score: 188 });
  if (first === 'autoclick' || first === 'autoclicker') { const rs = rest.toLowerCase(); if (rs === 'stop' || rs === 'off' || ctx.clicking) push({ id: 'ac:stop', title: 'Stop the auto-clicker', sub: 'Also stops by itself after the time limit', group: 'Tools', icon: '🖱️', kind: 'autoclick', stop: true, score: 188 }); const m4 = rs.match(/^(\d+)(?:\s*(?:\/s|per sec\w*|cps))?(?:\s+for\s+(\d+)\s*s?)?$/); const cps = m4 ? Math.min(50, Math.max(1, parseInt(m4[1], 10))) : 10; const secs = m4 && m4[2] ? Math.min(300, parseInt(m4[2], 10)) : 30; if (rs !== 'stop' && rs !== 'off') push({ id: 'ac:start', title: `Auto-click ${cps} times a second for ${secs} seconds`, sub: 'Starts 4 seconds after Enter: put the mouse where you want to click. Type  autoclick stop  to end it. Examples: autoclick 5   autoclick 20 for 60', group: 'Tools', icon: '🖱️', kind: 'autoclick', cps, secs, score: 188 }); }
  if (first === 'speedtest' || first === 'speed') push({ id: 'speed:run', title: 'Test my internet speed', sub: 'Opens fast.com in your browser. Ctrl+Enter opens speedtest.net', group: 'Tools', icon: '🚀', kind: 'url', url: 'https://fast.com', alt: { kind: 'url', url: 'https://www.speedtest.net' }, score: 188 });
  if (first === 'expander' || first === 'expand' || first === 'textexpansion') { const on = !!(ctx.expander && ctx.expander.on); push({ id: 'exp:toggle', title: on ? 'Turn system-wide text expansion OFF' : 'Turn system-wide text expansion ON', sub: on ? 'Currently on: type ;trigger anywhere (see  snip ). Only the last few letters are kept in memory, never saved.' : 'Then typing ;trigger in any app (browser, Word, chat...) swaps it for your snippet. Off by default. Needs  xdotool  on Linux.', group: 'Text expansion', icon: '⌨️', kind: 'expset', value: !on, score: 192 }); if (ctx.expander && ctx.expander.blocked && ctx.expander.blocked.length) push({ id: 'exp:blocked', title: 'These triggers are skipped because they are the start of a longer one: ' + ctx.expander.blocked.join(', '), sub: 'Rename one of them so neither begins with the other', group: 'Text expansion', icon: '⚠️', kind: 'noop', score: 191 }); }
  if (first === 'typeclip' || first === 'typeit' || (first === 'type' && !rest)) push({ id: 'type:clip', title: 'Type my clipboard (for pages that block pasting)', sub: 'Click into the box you want within 4 seconds after pressing Enter. It types the text key by key.', group: 'Tools', icon: '⌨️', kind: 'typeclip', score: 189 });
  if (first === 'cb' || first === 'clip' || first === 'clipboard' || first === 'paste') { for (const it of (ctx.clipboardItems || []).filter((i) => !rest || i.preview.toLowerCase().includes(rest.toLowerCase())).slice(0, 12)) push({ id: 'cb:' + it.id, title: it.preview.replace(/\s+/g, ' ').slice(0, 100), sub: (it.pinned ? '📌 pinned · ' : '') + 'Enter pastes, Ctrl+Enter pins/unpins', group: 'Clipboard history', icon: '📋', kind: 'cbpaste', cid: it.id, alt: { kind: 'cbpin', cid: it.id, pinned: !it.pinned }, score: 160 }); if (!(ctx.clipboardItems || []).length) push({ id: 'cb:none', title: 'Clipboard history is empty', sub: 'Copy some text and it shows up here. Kept in memory only, never saved to disk.', group: 'Clipboard history', icon: '📋', kind: 'noop', score: 100 }); }
  // emoji
  if ((first === 'emoji' || first === 'em' || first === ':') ) { const w = rest.toLowerCase(); for (const e of EMOJI.filter((e) => !w || e.kw.includes(w)).slice(0, 12)) push({ id: 'emoji:' + e.ch, title: `${e.ch}  ${e.kw.split(' ')[0]}`, sub: 'Enter pastes it, Ctrl+Enter copies it', group: 'Emoji', icon: e.ch, kind: 'emojipaste', copy: e.ch, score: 130 }); }
  else if (low.length >= 3) for (const e of EMOJI) if (e.kw.split(' ').some((k) => k === low)) push({ id: 'emoji:' + e.ch, title: `${e.ch}  ${e.kw.split(' ')[0]}`, sub: 'Emoji. Enter pastes it', group: 'Emoji', icon: e.ch, kind: 'emojipaste', copy: e.ch, score: 62 });
  // AI
  if ((first === 'ai' || first === 'ask' || first === '?') && rest) push({ id: 'ai:ask', title: `Ask local AI: ${rest.slice(0, 80)}`, sub: ctx.hasAI ? 'Runs on your own PC through Ollama (free, private)' : 'Needs Ollama (free). Enter shows how to set it up', group: 'AI', icon: '🤖', kind: 'ai', prompt: rest, score: 188 });
  // quicklinks
  const QL = [...D.quicklinks, ...QUICKLINKS.filter((d) => !D.quicklinks.some((u) => u.key === d.key))];
  const ql = QL.find((x) => x.key === first); if (ql && rest) push({ id: 'ql:' + ql.key, title: `${ql.name}: ${rest}`, sub: 'Opens in your browser', group: 'Quicklinks', icon: '🔗', kind: 'url', url: buildUrl(ql.url, rest), score: 187 });
  else if (ql && !rest) push({ id: 'ql:' + ql.key, title: `${ql.name}`, sub: `Type text after "${ql.key} " to search`, group: 'Quicklinks', icon: '🔗', kind: 'noop', score: 100 });
  if (/^(https?:\/\/|www\.)\S+$/i.test(raw) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|sa|ai|co|edu|gov)(\/\S*)?$/i.test(raw)) push({ id: 'url:open', title: `Open ${raw}`, sub: 'Opens in your browser', group: 'Web', icon: '🌐', kind: 'url', url: /^https?:/i.test(raw) ? raw : 'https://' + raw.replace(/^www\./i, 'www.'), score: 186 });
  if (first === 'quicklink' || first === 'quicklinks') { const am = rest.match(/^add\s+(\S+)\s+(https?:\/\/\S+)$/i); if (am) push({ id: 'ql:add', title: `Create quicklink "${am[1]}"`, sub: am[2] + '  (use {q} where the search text goes)', group: 'Quicklinks', icon: '🔗', kind: 'qladd', key: am[1].toLowerCase(), url: am[2], score: 185 }); else push({ id: 'ql:help', title: 'Create one:  quicklink add key https://site.com/search?q={q}', sub: 'Then type  key your words  to search that site', group: 'Quicklinks', icon: '🔗', kind: 'noop', score: 100 }); }
  // window management and system
  const rank = (title, kw) => Math.max(fuzzy(low, title), kw ? fuzzy(low, kw) * 0.85 : 0);
  for (const [id, title, icon] of WINDOW_ACTS) { const s = rank(title, title.replace('Window: ', 'window snap resize move ') ); if (s > 40 || (low.startsWith('win') && s > 0)) push({ id, title, sub: 'Moves and resizes the window you were just using', group: 'Window', icon, kind: 'win', score: s + ctx.data.boost(id) }); }
  for (const s of SYS) { const sc = rank(s.title, s.kw); if (sc > 40) push({ id: s.id, title: s.title, sub: s.sub, group: 'Commands', icon: s.icon, kind: 'sys', confirm: !!s.confirm, score: sc + ctx.data.boost(s.id) }); }
  if (platform === 'win32') for (const [t, uri] of WIN_PAGES) { const sc = Math.max(fuzzy(low, t), fuzzy(low, t + ' settings') * 0.8); if (sc > 40) push({ id: 'page:' + uri, title: t, sub: 'Windows settings page', group: 'Settings pages', icon: '⚙️', kind: 'uri', uri, score: sc }); }
  // Vorynth pages
  for (const p of ctx.auroraPages || []) { const sc = rank(p.title, p.kw); if (sc > 45) push({ id: 'aur:' + p.id, title: p.title, sub: 'Open in Vorynth Settings', group: 'Vorynth', icon: '✦', kind: 'aurora', page: p.id, score: sc * 0.95 + ctx.data.boost('aur:' + p.id) }); }
  // scripts
  for (const sc of ctx.scripts || []) { const s = fuzzy(low, sc.title); if (s > 40) push({ id: 'script:' + sc.file, title: sc.title, sub: 'Your script command', group: 'Scripts', icon: '📜', kind: 'script', file: sc.file, score: s + 5 }); }
  // helpers shown for meta words
  if (first === 'launcher' || low === 'settings launcher') push({ id: 'meta:settings', title: 'Launcher settings (hotkey, AI model...)', sub: 'Opens the settings file', group: 'Launcher', icon: '⚙️', kind: 'meta', which: 'settings', score: 100 });
  if (low.startsWith('script')) push({ id: 'meta:scripts', title: 'Open my scripts folder', sub: 'Put .ps1 / .bat / .sh / .py files here and they become commands', group: 'Launcher', icon: '📂', kind: 'meta', which: 'scripts', score: 100 });
  // apps
  const appHits = []; for (const a of ctx.apps) { const s = Math.max(fuzzy(low, a.title), a.keywords ? fuzzy(low, a.keywords) * 0.5 : 0); if (s > 20) appHits.push({ a, s: s + ctx.data.boost(a.id) }); }
  appHits.sort((x, y) => y.s - x.s).slice(0, 8).forEach(({ a, s }) => push({ id: a.id, title: a.title, sub: a.sub, group: 'Applications', kind: 'app', app: { id: a.id, title: a.title, file: a.file, exec: a.exec, terminal: a.terminal, aumid: a.aumid }, score: s + 20 }));
  // web fallback
  if (raw.length >= 2) push({ id: 'web:g', title: `Search the web for "${raw}"`, sub: 'Google. Other sites: type  yt  gh  wiki  maps  so  then your words', group: 'Web', icon: '🔎', kind: 'url', url: buildUrl('https://www.google.com/search?q={q}', raw), score: 5 });
  R.sort((a, b) => b.score - a.score);
  const seen = new Set(); return R.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }).slice(0, 14);
}


function transformText(name, t) {
  switch (name) {
    case 'upper': return t.toUpperCase(); case 'lower': return t.toLowerCase();
    case 'title': return t.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
    case 'sort': return t.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join('\n');
    case 'uniq': return [...new Set(t.split(/\r?\n/))].join('\n');
    case 'trim': return t.split(/\r?\n/).map((l) => l.trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1 && a[i - 1])).join('\n').trim();
    case 'reverse': return [...t].reverse().join('');
    case 'lines': return `${t.split(/\r?\n/).length} lines`;
    case 'count': return `${t.length} characters, ${t.split(/\s+/).filter(Boolean).length} words`;
    case 'json': try { return JSON.stringify(JSON.parse(t), null, 2); } catch (_) { return null; }
    case 'single': return t.replace(/\s*\r?\n\s*/g, ' ').trim();
    case 'quote': return t.split(/\r?\n/).map((l) => '> ' + l).join('\n');
    case 'plain': return t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u00A0/g, ' ');
    default: return null;
  }
}

module.exports = { transformText, calc, convert, parseCurrency, parseColor, utility, dateMath, fuzzy, search, createData, expandSnippet, parseDuration, scanLinuxApps, scanWindowsLnks, readDesktopFile, windowRect, QUICKLINKS, WINDOW_ACTS, SYS, EMOJI, buildUrl, fmtNum };
