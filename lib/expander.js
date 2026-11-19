'use strict';
/* System-wide text expansion for Vorynth Launcher. A tiny helper process reports typed characters; Vorynth keeps the last few in memory,
   and when they end with ";trigger" it deletes them and pastes the snippet. Nothing typed is ever saved, logged or sent anywhere. */
const path = require('path');
const { spawn, execFile } = require('child_process');

const MAX_BUF = 48;
function createMatcher({ prefix = ';' } = {}) {
  let buf = ''; let snippets = [];
  const word = /[A-Za-z0-9]/;
  return {
    // a trigger that is only the beginning of a longer trigger (";s" and ";sig") could fire too early, so it is left out and reported
    setSnippets(list) { const all = (list || []).filter((s) => s && s.trigger && s.text).map((s) => ({ key: prefix + s.trigger, text: s.text, trigger: s.trigger })); snippets = all.filter((s) => !all.some((o) => o !== s && o.key.length > s.key.length && o.key.startsWith(s.key))).sort((a, b) => b.key.length - a.key.length); this.blocked = all.filter((s) => !snippets.includes(s)).map((s) => s.trigger); },
    reset() { buf = ''; },
    peekLength() { return buf.length; },
    /* line is what the helper prints: "Cx" typed char, "B" backspace, "R" reset. Returns {snippet, del} when a trigger was just completed. */
    feed(line) {
      if (typeof line !== 'string' || !line) return null;
      const c = line[0];
      if (c === 'R') { buf = ''; return null; }
      if (c === 'B') { buf = buf.slice(0, -1); return null; }
      if (c !== 'C' || line.length < 2) return null;
      buf = (buf + line.slice(1)).slice(-MAX_BUF);
      for (const s of snippets) {
        if (buf.endsWith(s.key)) {
          const before = buf.length > s.key.length ? buf[buf.length - s.key.length - 1] : '';
          if (before && word.test(before)) continue; // "abc;sig" inside a word is not a trigger
          buf = ''; return { snippet: s, del: s.key.length };
        }
      }
      return null;
    }
  };
}

function createExpander({ appDir, platform = process.platform, getSnippets, expandText, clipboard, log = () => {}, prefix = ';' }) {
  const matcher = createMatcher({ prefix }); let child = null; let ready = false; let want = false; let busy = false; let restarts = 0; let lastStart = 0;
  const unpacked = (p) => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const helper = () => unpacked(path.join(appDir, 'expander', platform === 'win32' ? 'win.ps1' : 'linux.py'));

  function doExpand(hit) {
    if (busy) return; busy = true;
    const text = expandText(hit.snippet.text); const prev = clipboard.readText();
    clipboard.writeText(text);
    const done = () => { setTimeout(() => { try { if (clipboard.readText() === text) clipboard.writeText(prev); } catch (_) { /* ignore */ } busy = false; matcher.reset(); }, 700); };
    if (platform === 'win32') {
      const ps = `$w=New-Object -ComObject WScript.Shell; $w.SendKeys('{BS ${hit.del}}'); Start-Sleep -Milliseconds 70; $w.SendKeys('^v')`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000, windowsHide: true }, done);
    } else {
      const keys = Array(hit.del).fill('BackSpace');
      execFile('xdotool', ['key', '--clearmodifiers', '--delay', '6', ...keys], { timeout: 5000 }, () => {
        setTimeout(() => execFile('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { timeout: 4000 }, done), 60);
      });
    }
  }
  function onLine(line) {
    line = line.replace(/\r$/, '');
    if (line === 'READY') { ready = true; return; }
    const hit = busy ? null : matcher.feed(line);
    if (hit) doExpand(hit);
  }
  function start() {
    want = true; if (child) return true;
    matcher.setSnippets(getSnippets());
    try {
      child = platform === 'win32'
        ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', helper()], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        : spawn('python3', ['-I', helper()], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { log('Expander: could not start: ' + e.message); child = null; return false; }
    lastStart = Date.now(); let acc = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { acc += d; let i; while ((i = acc.indexOf('\n')) >= 0) { const l = acc.slice(0, i); acc = acc.slice(i + 1); onLine(l); } if (acc.length > 200) acc = ''; });
    child.stderr.on('data', (d) => log('Expander helper: ' + String(d).slice(0, 200)));
    child.on('error', (e) => log('Expander: ' + e.message));
    child.on('exit', () => { child = null; ready = false; matcher.reset(); if (want && Date.now() - lastStart > 5000 && restarts++ < 5) setTimeout(() => want && start(), 1500); });
    return true;
  }
  function stop() { want = false; if (child) { try { child.kill(); } catch (_) { /* ignore */ } child = null; } ready = false; matcher.reset(); }
  return { start, stop, refresh: () => matcher.setSnippets(getSnippets()), status: () => ({ on: want, running: !!child, ready }), _matcher: matcher, _onLine: onLine };
}
module.exports = { createMatcher, createExpander };
