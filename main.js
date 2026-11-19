const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell, dialog, powerSaveBlocker } = electron;
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
// Keep using the data folder from before the rename (settings, add-ons, Store, Doctor undo file), so nothing is lost.
try { app.setPath('userData', path.join(app.getPath('appData'), 'Aurora Settings')); } catch (_) { /* keep the default */ }
// Ubuntu 24.04 and other newer Linux systems block Electron's sandbox helper, so the app would refuse to open. The app only shows its own pages.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
// Add-ons are served from their own scheme with a strict content policy (see lib/addons.js). It must be registered before the app is ready.
try { if (electron.protocol && electron.protocol.registerSchemesAsPrivileged) electron.protocol.registerSchemesAsPrivileged([{ scheme: 'aurora-addon', privileges: { standard: true, secure: true } }]); } catch (_) { /* tests without Electron */ }

/* ---------- PowerShell runner ---------- */
function ps(script, timeout = 45000) {
  // -EncodedCommand avoids every quoting/escaping problem; UTF-8 output keeps Arabic app names intact.
  const full = "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;\n" + script;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, out, errOut) => (err ? reject(new Error(PSU.cleanPsError(errOut, err.message))) : resolve((out || '').trim()))
    );
  });
}
const elevate = (body, timeout = 120000) =>
  ps(`Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','${Buffer.from(body, 'utf16le').toString('base64')}'`, timeout);
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const PSU = require('./lib/psutil');
const asJson = (out) => {
  if (!out) return [];
  const v = JSON.parse(out);
  return Array.isArray(v) ? v : [v];
};


/* ---------- helpers for the extra features ---------- */
const FOLDERS = { profile: 'UserProfile', desktop: 'Desktop', documents: 'MyDocuments', pictures: 'MyPictures', videos: 'MyVideos', music: 'MyMusic', localappdata: 'LocalApplicationData', downloads: 'DOWNLOADS' };
const rootExpr = (key) => {
  if (!Object.prototype.hasOwnProperty.call(FOLDERS, key)) throw new Error('Unknown folder');
  return key === 'downloads'
    ? "(Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads')"
    : `[Environment]::GetFolderPath('${FOLDERS[key]}')`;
};
// Only files inside the user's own profile may be revealed, opened or moved to the Recycle Bin.
function insideHome(p) {
  if (typeof p !== 'string' || !p) return false;
  const home = path.resolve(os.homedir()), full = path.resolve(p);
  const norm = (x) => (isWin ? x.toLowerCase() : x);
  return norm(full).startsWith(norm(home + path.sep)) && fs.existsSync(full);
}
const xmlDecode = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseBatteryXml(xml) {
  return [...String(xml).matchAll(/<Battery>([\s\S]*?)<\/Battery>/g)].map((m) => {
    const g = (tag) => { const r = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(m[1]); return r ? r[1].trim() : null; };
    const design = Number(g('DesignCapacity')), full = Number(g('FullChargeCapacity'));
    return { name: g('Id') || 'Battery', maker: g('Manufacturer') || '', chemistry: g('Chemistry') || '', design, full,
      cycles: g('CycleCount') != null && g('CycleCount') !== '' ? Number(g('CycleCount')) : null,
      health: design > 0 ? Math.round((full / design) * 1000) / 10 : null };
  }).filter((b) => b.design > 0);
}
function parseWifiXml(xml) {
  const name = /<name>([^<]*)<\/name>/.exec(xml), key = /<keyMaterial>([^<]*)<\/keyMaterial>/.exec(xml), auth = /<authentication>([^<]*)<\/authentication>/.exec(xml);
  return name ? { name: xmlDecode(name[1]), password: key ? xmlDecode(key[1]) : null, security: auth ? auth[1] : '' } : null;
}

/* Internet speed test against Cloudflare's public speed endpoints (base URL is injectable for tests). */
async function runSpeedTest(base = 'https://speed.cloudflare.com') {
  const lat = [];
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    const r = await fetch(`${base}/__down?bytes=0`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    await r.arrayBuffer();
    lat.push(performance.now() - t0);
  }
  lat.shift(); // first request includes connection setup
  const latency = Math.round(lat.reduce((a, b) => a + b, 0) / lat.length);
  const jitter = Math.round(lat.slice(1).reduce((a, v, i) => a + Math.abs(v - lat[i]), 0) / (lat.length - 1));

  const t1 = performance.now(); let got = 0;
  const dl = await fetch(`${base}/__down?bytes=30000000`, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
  for await (const chunk of dl.body) { got += chunk.length; if (performance.now() - t1 > 12000) break; }
  const downMbps = Math.round(((got * 8) / 1e6 / ((performance.now() - t1) / 1000)) * 10) / 10;

  const t2 = performance.now();
  const body = Buffer.alloc(12_000_000, 97);
  const up = await fetch(`${base}/__up`, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(25000) });
  await up.arrayBuffer();
  const upMbps = Math.round(((body.length * 8) / 1e6 / ((performance.now() - t2) / 1000)) * 10) / 10;
  return { latency, jitter, downMbps, upMbps, at: new Date().toISOString() };
}

/* Keep-awake (like PowerToys Awake): works while Vorynth is running; you can minimize it. */
const awake = { id: null, mode: 'off', endsAt: 0, timer: null };
function awakeStop() {
  if (awake.id != null && powerSaveBlocker.isStarted(awake.id)) powerSaveBlocker.stop(awake.id);
  clearTimeout(awake.timer); awake.id = null; awake.mode = 'off'; awake.endsAt = 0; awake.timer = null;
}


/* ---------- Windows Update Agent: install updates natively ---------- */
const wuDir = () => path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'aurora-wu');
const GUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const WU_ACTIVE = ['starting', 'searching', 'downloading', 'installing'];
let lastWuState = { state: { phase: 'idle' }, ageSec: 0 };
function readWuState() {
  const f = path.join(wuDir(), 'state.json');
  try {
    const st = fs.statSync(f);
    const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    lastWuState = { state: JSON.parse(raw), ageSec: Math.max(0, Math.round((Date.now() - st.mtimeMs) / 1000)) };
  } catch (e) { if (e.code === 'ENOENT') lastWuState = { state: { phase: 'idle' }, ageSec: 0 }; /* else: file was mid-write, keep the last good state */ }
  return lastWuState;
}
// The script that runs elevated. Only validated GUIDs and a fixed criteria string are ever placed inside it.
function wuInstallScript(dir, ids, criteria) {
  return `
$ErrorActionPreference='Stop'
$dir=${q(dir)}; $state=Join-Path $dir 'state.json'; $cancel=Join-Path $dir 'cancel.flag'
$want=@(${ids.map(q).join(',')})
$results=New-Object System.Collections.ArrayList
$script:reboot=$false
function Save($phase,$cur,$tot,$title,$err) {
  $o=[ordered]@{phase=$phase;current=$cur;total=$tot;title=$title;results=@($results);reboot=$script:reboot;error=$err}
  ($o | ConvertTo-Json -Depth 5 -Compress) | Set-Content -LiteralPath $state -Encoding UTF8
}
try {
  Save 'searching' 0 0 '' $null
  $session=New-Object -ComObject Microsoft.Update.Session
  $found=$session.CreateUpdateSearcher().Search(${q(criteria)})
  $list=@(); foreach($u in $found.Updates){ if($want.Count -eq 0 -or $want -contains $u.Identity.UpdateID){ $list+=$u } }
  if($list.Count -eq 0){ Save 'done' 0 0 '' $null; return }
  $n=$list.Count; $i=0
  foreach($u in $list){
    $i++
    if(Test-Path -LiteralPath $cancel){ Save 'cancelled' ($i-1) $n '' $null; return }
    $title=[string]$u.Title
    try {
      if($u.InstallationBehavior.CanRequestUserInput){ [void]$results.Add(@{title=$title;ok=$false;note='This update needs your input. Install it from Windows Update.'}); continue }
      if(-not $u.EulaAccepted){ $u.AcceptEula() }
      Save 'downloading' $i $n $title $null
      $c=New-Object -ComObject Microsoft.Update.UpdateColl; [void]$c.Add($u)
      $dl=$session.CreateUpdateDownloader(); $dl.Updates=$c; $dr=$dl.Download()
      if($dr.ResultCode -ne 2 -and $dr.ResultCode -ne 3){ throw "Download failed (code $($dr.ResultCode))" }
      Save 'installing' $i $n $title $null
      $inst=$session.CreateUpdateInstaller(); $inst.Updates=$c; $inst.AllowSourcePrompts=$false; $ir=$inst.Install()
      $ok=($ir.ResultCode -eq 2 -or $ir.ResultCode -eq 3)
      if($ir.RebootRequired){ $script:reboot=$true }
      [void]$results.Add(@{title=$title;ok=$ok;code=[int]$ir.ResultCode;reboot=[bool]$ir.RebootRequired})
    } catch { [void]$results.Add(@{title=$title;ok=$false;note=$_.Exception.Message}) }
  }
  Save 'done' $n $n '' $null
} catch { Save 'error' 0 0 '' $_.Exception.Message }
`;
}
// Start an elevated PowerShell and return immediately (the UAC prompt is the only thing we wait for).
const elevateDetached = (body) =>
  ps(`Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${Buffer.from(body, 'utf16le').toString('base64')}'`, 60000);

/* ---------- parsers for netsh / powercfg output (language-tolerant) ---------- */
function parseWifiScan(out) {
  const blocks = String(out).split(/^\s*SSID\s+\d+\s*:/m).slice(1);
  const best = new Map();
  blocks.forEach((b) => {
    const ssid = (b.split(/\r?\n/)[0] || '').trim();
    if (!ssid) return;
    const sig = Math.max(0, ...[...b.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1])));
    const secure = /WPA|WEP|RSN/i.test(b);
    const wpa3only = /WPA3/i.test(b) && !/WPA2|WPA-/i.test(b.replace(/WPA3/gi, ''));
    const prev = best.get(ssid);
    if (!prev || sig > prev.signal) best.set(ssid, { ssid, signal: sig, secure, wpa3only });
  });
  return [...best.values()].sort((a, b) => b.signal - a.signal);
}
function parseWifiProfiles(out) {
  return [...String(out).matchAll(/^[ \t]+[^:\r\n]+:[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]).filter((n, i, a) => n && a.indexOf(n) === i);
}
function parseWifiCurrent(out) {
  const m = /^[ \t]*SSID[ \t]*:[ \t]*(\S.*?)[ \t]*$/m.exec(String(out)); // [ \t] not \s: must not run across a line break
  return m ? m[1] : null;
}
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function buildWifiProfileXml(ssid, password, wpa3only) {
  const sec = password
    ? `<authEncryption><authentication>${wpa3only ? 'WPA3SAE' : 'WPA2PSK'}</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xmlEsc(password)}</keyMaterial></sharedKey>`
    : '<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>';
  return `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${xmlEsc(ssid)}</name><SSIDConfig><SSID><name>${xmlEsc(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>${sec}</security></MSM></WLANProfile>`;
}
// `powercfg /query` prints seconds as 0x........ ; the last two hex values are the AC and DC settings.
function parsePowerQuery(out) {
  const hex = [...String(out).matchAll(/0x([0-9a-f]{8})/gi)].map((m) => parseInt(m[1], 16));
  return hex.length >= 2 ? { ac: Math.round(hex[hex.length - 2] / 60), dc: Math.round(hex[hex.length - 1] / 60) } : null;
}
const runFile = (file, args, timeout = 30000) => new Promise((resolve, reject) =>
  execFile(file, args, { windowsHide: true, timeout, encoding: 'utf8' }, (err, out, errOut) => (err ? reject(new Error(((errOut || out || '').trim() || err.message).split('\n')[0])) : resolve((out || '').trim()))));
const okName = (n, max = 255) => typeof n === 'string' && n.length >= 1 && n.length <= max && !/[\u0000-\u001f]/.test(n);
const TIMEOUT_CHOICES = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 120, 180, 240, 300];


const MOUSE_CS = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class Mo {
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref int c, uint d);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, IntPtr c, uint d);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
}
'@`;
const DISPLAY_CS = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
public struct DEVMODE {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
  public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
  public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
  public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
  public short dmLogPixels;
  public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency, dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
}
public class Disp {
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
  public static DEVMODE Make() { DEVMODE d = new DEVMODE(); d.dmDeviceName = new string((char)0, 32); d.dmFormName = new string((char)0, 32); d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return d; }
}
'@`;


const RADIO_PS = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(-1); $t.Result }
[void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
[void][Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime]
[void][Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime]
[void](Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])`;
// Services Vorynth will not stop or disable: doing so can break Windows itself.
const CORE_SERVICES = ['rpcss', 'dcomlaunch', 'rpcepmapper', 'lsm', 'samss', 'eventlog', 'plugplay', 'power', 'winmgmt', 'profsvc', 'gpsvc', 'cryptsvc', 'bfe', 'mpssvc', 'windefend', 'sens', 'usermanager', 'coremessaging', 'brokerinfrastructure', 'systemeventsbroker', 'schedule', 'lanmanworkstation', 'nsi', 'dhcp', 'dnscache', 'netprofm', 'nlasvc', 'audiosrv', 'audioendpointbuilder', 'themes', 'trustedinstaller', 'wuauserv', 'sppsvc', 'securityhealthservice', 'wscsvc', 'keyiso', 'lsass'];
const SERVICE_ACTIONS = { start: 'Start-Service -Name $n', stop: 'Stop-Service -Name $n -Force', restart: 'Restart-Service -Name $n -Force', auto: "Set-Service -Name $n -StartupType Automatic", manual: "Set-Service -Name $n -StartupType Manual", disabled: "Set-Service -Name $n -StartupType Disabled" };
const esch = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function buildReportHtml(d) {
  const rows = (arr, cols) => arr.map((r) => `<tr>${cols.map((c) => `<td>${esch(r[c])}</td>`).join('')}</tr>`).join('');
  const kv = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<tr><th>${esch(k)}</th><td>${esch(v)}</td></tr>`).join('');
  const gb = (n) => (Number(n) / 1073741824).toFixed(1) + ' GB';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>PC report</title><style>body{font:14px Segoe UI,system-ui,sans-serif;margin:32px;color:#16181d}h1{margin:0 0 4px}h2{margin:28px 0 8px;border-bottom:2px solid #4cc2ff;padding-bottom:4px}table{border-collapse:collapse;width:100%;max-width:900px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e3e6ec;vertical-align:top}th{width:240px;color:#55606f;font-weight:600}.small{color:#6b7482}</style></head><body>
<h1>PC report</h1><div class="small">Created by Vorynth Settings on ${esch(new Date(d.when || Date.now()).toLocaleString())}</div>
<h2>System</h2><table>${kv({ 'Device name': d.sys?.device, Windows: d.sys?.os, Version: d.sys?.version, Architecture: d.sys?.arch, Processor: d.sys?.cpu, 'Cores / threads': d.sys ? `${d.sys.cores} / ${d.sys.threads}` : '', Graphics: d.sys?.gpu, Memory: d.sys ? d.sys.ramGB + ' GB' : '', Manufacturer: d.sys?.maker, Model: d.sys?.model, BIOS: d.sys?.bios })}</table>
<h2>Storage</h2><table><tr><th>Drive</th><th>Used</th><th>Free</th></tr>${(d.drives || []).map((x) => `<tr><td>${esch(x.name)}:</td><td>${gb(x.used)}</td><td>${gb(x.free)}</td></tr>`).join('')}</table>
${(d.disks || []).length ? `<h2>Disk health</h2><table>${rows(d.disks, ['name', 'type', 'health'])}</table>` : ''}
${(d.battery || []).length ? `<h2>Battery</h2><table>${rows(d.battery.map((b) => ({ name: b.name, health: b.health + '%', cycles: b.cycles ?? 'n/a', capacity: `${(b.full / 1000).toFixed(1)} of ${(b.design / 1000).toFixed(1)} Wh` })), ['name', 'health', 'cycles', 'capacity'])}</table>` : ''}
${d.update ? `<h2>Windows Update</h2><table>${kv({ Edition: d.update.product, Version: d.update.display, Build: d.update.build + '.' + d.update.ubr, 'Restart pending': d.update.reboot ? 'Yes' : 'No', 'Last check': d.update.lastCheck })}</table>` : ''}
${(d.network || []).length ? `<h2>Network adapters</h2><table>${rows(d.network, ['name', 'status', 'speed', 'ip'])}</table>` : ''}
${(d.startup || []).length ? `<h2>Startup apps</h2><table>${rows(d.startup.map((s2) => ({ name: s2.name, state: s2.enabled ? 'On' : 'Off', command: s2.command })), ['name', 'state', 'command'])}</table>` : ''}
${(d.problems || []).length ? `<h2>Devices with problems</h2><table>${rows(d.problems, ['name', 'class', 'status'])}</table>` : ''}
</body></html>`;
}

/* ---------- Registry-backed toggles ---------- */
const ADV = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const PERS = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const CLSID = 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}';

function consentToggle(name) {
  const p = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\${name}`;
  return {
    getScript: `(Get-ItemProperty -Path ${q(p)} -Name Value -ErrorAction SilentlyContinue).Value -ne 'Deny'`,
    onScript: `if (-not (Test-Path ${q(p)})) { New-Item -Path ${q(p)} -Force | Out-Null }; Set-ItemProperty -Path ${q(p)} -Name Value -Value 'Allow'`,
    offScript: `if (-not (Test-Path ${q(p)})) { New-Item -Path ${q(p)} -Force | Out-Null }; Set-ItemProperty -Path ${q(p)} -Name Value -Value 'Deny'`
  };
}
// Keyboard accessibility hotkeys are a bit (0x4) inside a "Flags" string value; flip only that bit.
function flagToggle(p) {
  return {
    getScript: `([int](Get-ItemProperty -Path ${q(p)}).Flags -band 4) -ne 0`,
    onScript: `$f=[int](Get-ItemProperty -Path ${q(p)}).Flags; Set-ItemProperty -Path ${q(p)} -Name Flags -Value ([string]($f -bor 4))`,
    offScript: `$f=[int](Get-ItemProperty -Path ${q(p)}).Flags; Set-ItemProperty -Path ${q(p)} -Name Flags -Value ([string]($f -band (-bnot 4)))`
  };
}

const TOGGLES = {
  darkMode: { path: PERS, names: ['AppsUseLightTheme', 'SystemUsesLightTheme'], on: 0, off: 1 },
  transparency: { path: PERS, names: ['EnableTransparency'], on: 1, off: 0 },
  taskbarCenter: { path: ADV, names: ['TaskbarAl'], on: 1, off: 0, explorer: true },
  taskView: { path: ADV, names: ['ShowTaskViewButton'], on: 1, off: 0, explorer: true },
  widgets: { path: ADV, names: ['TaskbarDa'], on: 1, off: 0, explorer: true },
  searchBox: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', names: ['SearchboxTaskbarMode'], on: 2, off: 0, explorer: true },
  showSeconds: { path: ADV, names: ['ShowSecondsInSystemClock'], on: 1, off: 0, explorer: true },
  fileExt: { path: ADV, names: ['HideFileExt'], on: 0, off: 1, explorer: true },
  hiddenFiles: { path: ADV, names: ['Hidden'], on: 1, off: 2, explorer: true },
  adId: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', names: ['Enabled'], on: 1, off: 0 },
  tailored: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', names: ['TailoredExperiencesWithDiagnosticDataEnabled'], on: 1, off: 0 },
  clipboardHistory: { path: 'HKCU:\\Software\\Microsoft\\Clipboard', names: ['EnableClipboardHistory'], on: 1, off: 0 },
  gameMode: { path: 'HKCU:\\Software\\Microsoft\\GameBar', names: ['AutoGameModeEnabled'], on: 1, off: 0 },
  suggestions: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', names: ['SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled', 'SystemPaneSuggestionsEnabled', 'SilentInstalledAppsEnabled'], on: 1, off: 0 },
  gameBar: { path: 'HKCU:\\Software\\Microsoft\\GameBar', names: ['UseNexusForGameBarEnabled'], on: 1, off: 0 },
  notifications: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', names: ['ToastEnabled'], on: 1, off: 0 },
  notifSound: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', names: ['NOC_GLOBAL_SETTINGS_ALLOW_NOTIFICATION_SOUND'], on: 1, off: 0 },
  notifLock: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings', names: ['NOC_GLOBAL_SETTINGS_ALLOW_TOASTS_ABOVE_LOCK'], on: 1, off: 0 },
  scrollbars: { path: 'HKCU:\\Control Panel\\Accessibility', names: ['DynamicScrollbars'], on: 0, off: 1 },
  // 24-hour clock: several string values under International
  hour24: {
    getScript: `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\International').iTime -eq '1'`,
    onScript: `$p='HKCU:\\Control Panel\\International'; Set-ItemProperty -Path $p -Name sTimeFormat -Value 'HH:mm:ss'; Set-ItemProperty -Path $p -Name sShortTime -Value 'HH:mm'; Set-ItemProperty -Path $p -Name iTime -Value '1'; rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True`,
    offScript: `$p='HKCU:\\Control Panel\\International'; Set-ItemProperty -Path $p -Name sTimeFormat -Value 'h:mm:ss tt'; Set-ItemProperty -Path $p -Name sShortTime -Value 'h:mm tt'; Set-ItemProperty -Path $p -Name iTime -Value '0'; rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True`
  },
  // Per-user app permissions (the same values the Settings app writes for "Let apps access ...")
  privacyLocation: consentToggle('location'),
  privacyCamera: consentToggle('webcam'),
  privacyMic: consentToggle('microphone'),
  autoplay: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\AutoplayHandlers', names: ['DisableAutoplay'], on: 0, off: 1 },
  stickyKeys: flagToggle('HKCU:\\Control Panel\\Accessibility\\StickyKeys'),
  filterKeys: flagToggle('HKCU:\\Control Panel\\Accessibility\\Keyboard Response'),
  toggleKeys: flagToggle('HKCU:\\Control Panel\\Accessibility\\ToggleKeys'),
  // Vorynth Mods: small reversible per-user tweaks (no system files are touched)
  taskbarEndTask: { path: ADV + '\\TaskbarDeveloperSettings', names: ['TaskbarEndTask'], on: 1, off: 0, explorer: true },
  taskbarNeverCombine: { path: ADV, names: ['TaskbarGlomLevel'], on: 2, off: 0, explorer: true },
  taskbarDesktopBtn: { path: ADV, names: ['TaskbarSd'], on: 1, off: 0, explorer: true },
  taskbarBadges: { path: ADV, names: ['TaskbarBadges'], on: 1, off: 0, explorer: true },
  taskbarAnimations: { path: ADV, names: ['TaskbarAnimations'], on: 1, off: 0, explorer: true },
  copilotButton: { path: ADV, names: ['ShowCopilotButton'], on: 1, off: 0, explorer: true },
  startRecs: { path: ADV, names: ['Start_IrisRecommendations'], on: 1, off: 0, explorer: true },
  snapFlyout: { path: ADV, names: ['EnableSnapAssistFlyout'], on: 1, off: 0 },
  aeroShake: { path: ADV, names: ['DisallowShaking'], on: 0, off: 1 },
  webSearch: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer', names: ['DisableSearchBoxSuggestions'], on: 0, off: 1, explorer: true },
  desktopIcons: { path: ADV, names: ['HideIcons'], on: 0, off: 1, explorer: true },
  superHidden: { path: ADV, names: ['ShowSuperHidden'], on: 1, off: 0, explorer: true },
  checkboxes: { path: ADV, names: ['AutoCheckSelect'], on: 1, off: 0, explorer: true },
  compactView: { path: ADV, names: ['UseCompactMode'], on: 1, off: 0, explorer: true },
  openThisPC: { path: ADV, names: ['LaunchTo'], on: 1, off: 2, explorer: true },
  separateProcess: { path: ADV, names: ['SeparateProcess'], on: 1, off: 0, explorer: true },
  fullPathTitle: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CabinetState', names: ['FullPath'], on: 1, off: 0, explorer: true },
  showRecent: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', names: ['ShowRecent', 'ShowFrequent'], on: 1, off: 0, explorer: true },
  navPaneExpand: { path: ADV, names: ['NavPaneExpandToCurrentFolder'], on: 1, off: 0, explorer: true },
  navPaneAll: { path: ADV, names: ['NavPaneShowAllFolders'], on: 1, off: 0, explorer: true },
  mergeConflicts: { path: ADV, names: ['HideMergeConflicts'], on: 0, off: 1, explorer: true },
  iconsOnly: { path: ADV, names: ['IconsOnly'], on: 1, off: 0, explorer: true },
  iconShadow: { path: ADV, names: ['ListviewShadow'], on: 1, off: 0, explorer: true },
  infoTips: { path: ADV, names: ['ShowInfoTip'], on: 1, off: 0, explorer: true },
  startTrackDocs: { path: ADV, names: ['Start_TrackDocs'], on: 1, off: 0, explorer: true },
  startTrackProgs: { path: ADV, names: ['Start_TrackProgs'], on: 1, off: 0, explorer: true },
  chatButton: { path: ADV, names: ['TaskbarMn'], on: 1, off: 0, explorer: true },
  startAcctNotif: { path: ADV, names: ['Start_AccountNotifications'], on: 1, off: 0, explorer: true },
  taskbarAllMon: { path: ADV, names: ['MMTaskbarEnabled'], on: 1, off: 0, explorer: true },
  // AI features: ON means allowed. The policy keys are the ones Windows itself documents; removing the block is what "on" does.
  aiCopilot: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', names: ['TurnOffWindowsCopilot'], on: 0, off: 1, explorer: true },
  aiRecall: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', names: ['DisableAIDataAnalysis'], on: 0, off: 1 },
  aiEdge: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Edge', names: ['HubsSidebarEnabled', 'CopilotPageContext'], on: 1, off: 0 },
  // Machine-wide AI blocks (Paint Cocreator/Generative fill/Image creator, Notepad AI, and a hard block on enabling Recall). One permission prompt for all three.
  aiMachine: {
    getScript: "$p=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint' -ErrorAction SilentlyContinue; $n=Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\WindowsNotepad' -ErrorAction SilentlyContinue; $r=Get-ItemProperty 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI' -ErrorAction SilentlyContinue; $blocked = ($p -and $p.DisableCocreator -eq 1 -and $p.DisableGenerativeFill -eq 1 -and $p.DisableImageCreator -eq 1) -and ($n -and $n.DisableAIFeatures -eq 1) -and ($r -and $r.AllowRecallEnablement -eq 0); -not $blocked",
    offScript: PSU.adminCmd("function S($k,$n,$v){ if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }; New-ItemProperty -Path $k -Name $n -Value $v -PropertyType DWord -Force | Out-Null }; $pk='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint'; S $pk DisableCocreator 1; S $pk DisableGenerativeFill 1; S $pk DisableImageCreator 1; S 'HKLM:\\SOFTWARE\\Policies\\WindowsNotepad' DisableAIFeatures 1; S 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI' AllowRecallEnablement 0"),
    onScript: PSU.adminCmd("$pk='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint'; foreach ($n in 'DisableCocreator','DisableGenerativeFill','DisableImageCreator') { Remove-ItemProperty -Path $pk -Name $n -ErrorAction SilentlyContinue }; Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\WindowsNotepad' -Name DisableAIFeatures -ErrorAction SilentlyContinue; Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI' -Name AllowRecallEnablement -ErrorAction SilentlyContinue")
  },
  aiClickToDo: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', names: ['DisableClickToDo'], on: 0, off: 1 },
  // ---- Turn off Microsoft features. ON = the Microsoft feature is active. All per-user and reversible, except telemetry (needs one permission prompt). ----
  msLockSpot: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', names: ['RotatingLockScreenOverlayEnabled', 'SubscribedContent-338387Enabled'], on: 1, off: 0 },
  msSettingsAds: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', names: ['SubscribedContent-338393Enabled', 'SubscribedContent-353694Enabled', 'SubscribedContent-353696Enabled'], on: 1, off: 0 },
  msOneDriveNag: { path: ADV, names: ['ShowSyncProviderNotifications'], on: 1, off: 0, explorer: true },
  msSearchHighlights: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings', names: ['IsDynamicSearchBoxEnabled'], on: 1, off: 0, explorer: true },
  msErrorReport: { path: 'HKCU:\\Software\\Microsoft\\Windows\\Windows Error Reporting', names: ['Disabled'], on: 0, off: 1 },
  msSpeechOnline: { path: 'HKCU:\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy', names: ['HasAccepted'], on: 1, off: 0 },
  msTypingLearn: { path: 'HKCU:\\Software\\Microsoft\\InputPersonalization', names: ['RestrictImplicitTextCollection', 'RestrictImplicitInkCollection'], on: 0, off: 1 },
  msLangOptOut: { path: 'HKCU:\\Control Panel\\International\\User Profile', names: ['HttpAcceptLanguageOptOut'], on: 0, off: 1 },
  msEdgePromos: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Edge', names: ['ShowRecommendationsEnabled', 'PersonalizationReportingEnabled', 'EdgeShoppingAssistantEnabled', 'MicrosoftEdgeInsiderPromotionEnabled'], on: 1, off: 0 },
  msEdgeBg: { path: 'HKCU:\\Software\\Policies\\Microsoft\\Edge', names: ['StartupBoostEnabled', 'BackgroundModeEnabled'], on: 1, off: 0 },
  msBgApps: { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', names: ['GlobalUserDisabled'], on: 0, off: 1 },
  msTelemetry: {
    getScript: "$s = Get-Service DiagTrack -ErrorAction SilentlyContinue; ($s -ne $null) -and ($s.StartType -ne 'Disabled')",
    offScript: PSU.adminCmd("$k='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection'; if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }; New-ItemProperty -Path $k -Name AllowTelemetry -Value 0 -PropertyType DWord -Force | Out-Null; Stop-Service DiagTrack -Force -ErrorAction SilentlyContinue; Set-Service DiagTrack -StartupType Disabled"),
    onScript: PSU.adminCmd("Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name AllowTelemetry -ErrorAction SilentlyContinue; Set-Service DiagTrack -StartupType Automatic; Start-Service DiagTrack -ErrorAction SilentlyContinue")
  },
  // Custom: Windows 10 style right-click menu
  classicMenu: {
    getScript: `Test-Path ${q(CLSID + '\\InprocServer32')}`,
    onScript: `if (-not (Test-Path ${q(CLSID + '\\InprocServer32')})) { New-Item -Path ${q(CLSID + '\\InprocServer32')} -Force | Out-Null }; Set-ItemProperty -Path ${q(CLSID + '\\InprocServer32')} -Name '(default)' -Value ''`,
    offScript: `Remove-Item -Path ${q(CLSID)} -Recurse -Force -ErrorAction SilentlyContinue`,
    explorer: true
  }
};

const restartExplorer = "Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }";

async function toggleGetMany(ids) {
  const list = [...new Set((ids || []).filter((id) => typeof id === 'string' && TOGGLES[id]))].slice(0, 40);
  if (!list.length) return {};
  const lines = list.map((id) => {
    const t = TOGGLES[id];
    return t.getScript
      ? `$r[${q(id)}] = [bool](${t.getScript})`
      : `$r[${q(id)}] = ${PSU.regReadScript(t.path, t.names[0])}` + (PSU.policyAlt(t.path) ? `\n$r[${q(id + '|m')}] = ${PSU.regReadScript(PSU.policyAlt(t.path), t.names[0])}` : '');
  });
  const out = await ps(`$r=@{}\n${lines.join('\n')}\n$r | ConvertTo-Json -Compress`);
  const raw = out ? JSON.parse(out) : {};
  const res = {};
  list.forEach((id) => {
    const t = TOGGLES[id], v = raw[id];
    res[id] = t.getScript ? v === true : PSU.policyAlt(t.path) ? PSU.policyState(v, raw[id + '|m'], t, defaultOn(id)) : v == null ? defaultOn(id) : Number(v) === t.on; // missing value = Windows default
  });
  return res;
}
async function toggleGet(id) {
  if (!TOGGLES[id]) throw new Error('Unknown toggle');
  return (await toggleGetMany([id]))[id];
}
// Windows defaults when the registry value doesn't exist yet.
function defaultOn(id) {
  return ['adId', 'tailored', 'gameMode', 'gameBar', 'taskbarCenter', 'taskView', 'widgets', 'transparency', 'searchBox', 'suggestions', 'notifications', 'notifSound', 'notifLock', 'privacyLocation', 'privacyCamera', 'privacyMic', 'autoplay', 'taskbarBadges', 'taskbarAnimations', 'copilotButton', 'startRecs', 'snapFlyout', 'aeroShake', 'webSearch', 'desktopIcons', 'showRecent', 'iconShadow', 'infoTips', 'startTrackDocs', 'startTrackProgs', 'chatButton', 'startAcctNotif', 'taskbarAllMon', 'aiCopilot', 'aiRecall', 'aiEdge', 'aiMachine', 'msLockSpot', 'msSettingsAds', 'msOneDriveNag', 'msSearchHighlights', 'msErrorReport', 'msSpeechOnline', 'msTypingLearn', 'msLangOptOut', 'msEdgePromos', 'msEdgeBg', 'msBgApps'].includes(id);
}

async function toggleSet(id, value, defer = false) {
  const t = TOGGLES[id];
  if (!t) throw new Error('Unknown toggle');
  if (t.getScript) {
    await ps(value ? t.onScript : t.offScript);
  } else {
    const v = value ? t.on : t.off; const alt = PSU.policyAlt(t.path);
    const adminWrite = async (val) => { // machine-wide policy: one Windows permission prompt, then verify it really changed
      await elevate(PSU.regWriteScript(alt, t.names, val), 60000);
      const chk = await ps(PSU.regReadScript(alt, t.names[0])); if (String(chk).trim() !== String(val)) throw new Error('Windows did not allow the change (blocked, or the permission prompt was declined)');
    };
    try { await ps(PSU.regWriteScript(t.path, t.names, v)); } catch (e) { if (!alt) throw e; await adminWrite(v); } // some PCs lock the per-user policy key
    if (alt && value) { // allowing again: also lift a machine-wide block that an earlier fallback set
      const cur = await ps(PSU.regReadScript(alt, t.names[0])).catch(() => ''); if (String(cur).trim() === String(t.off)) await adminWrite(t.on);
    }
  }
  if (t.explorer && !defer) await ps(restartExplorer);
  return true;
}

/* ---------- Start menu choices with more than two values, and one-click presets ---------- */
const SRCH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search';
const DWORDS = {
  startLayout: { path: ADV, name: 'Start_Layout', def: 0, allowed: [0, 1, 2] },
  searchMode: { path: SRCH, name: 'SearchboxTaskbarMode', def: 2, allowed: [0, 1, 2, 3] },
  taskbarSize: { path: ADV, name: 'TaskbarSi', def: 1, allowed: [0, 1, 2] },
  taskbarMulti: { path: ADV, name: 'MMTaskbarMode', def: 0, allowed: [0, 1, 2] }
};
async function dwordGet(id) {
  const d = DWORDS[id]; if (!d) throw new Error('Unknown setting');
  const out = await ps(`(Get-ItemProperty -Path ${q(d.path)} -Name ${q(d.name)} -ErrorAction SilentlyContinue).${q(d.name)}`);
  const n = parseInt(String(out || '').trim(), 10);
  return String(Number.isFinite(n) ? n : d.def);
}
async function dwordSet(id, value) {
  const d = DWORDS[id]; if (!d) throw new Error('Unknown setting');
  const v = parseInt(value, 10); if (!d.allowed.includes(v)) throw new Error('That choice is not allowed');
  await ps(`if (-not (Test-Path ${q(d.path)})) { New-Item -Path ${q(d.path)} -Force | Out-Null }; New-ItemProperty -Path ${q(d.path)} -Name ${q(d.name)} -Value ${v} -PropertyType DWord -Force | Out-Null`);
  await ps(restartExplorer).catch(() => {});
  return true;
}
const PRESETS = {
  startClean: { dwords: { startLayout: 1 }, toggles: { startRecs: false, startAcctNotif: false, startTrackDocs: false, startTrackProgs: false, webSearch: false } },
  startDefault: { dwords: { startLayout: 0, searchMode: 2, taskbarSize: 1 }, toggles: { startRecs: true, startAcctNotif: true, startTrackDocs: true, startTrackProgs: true, webSearch: true, taskbarCenter: true } },
  startLeft: { dwords: {}, toggles: { taskbarCenter: false } },
  aiAllOff: { dwords: {}, toggles: { aiMachine: false, aiCopilot: false, copilotButton: false, aiRecall: false, aiEdge: false, aiClickToDo: false, webSearch: false } },
  msAllOff: { dwords: {}, toggles: { aiMachine: false, aiCopilot: false, copilotButton: false, aiRecall: false, aiEdge: false, aiClickToDo: false, msBgApps: false, suggestions: false, adId: false, tailored: false, startRecs: false, widgets: false, chatButton: false, webSearch: false, msLockSpot: false, msSettingsAds: false, msOneDriveNag: false, msSearchHighlights: false, msErrorReport: false, msSpeechOnline: false, msTypingLearn: false, msLangOptOut: false, msEdgePromos: false, msEdgeBg: false } },
  msAllOn: { dwords: {}, toggles: { aiMachine: true, aiCopilot: true, copilotButton: true, aiRecall: true, aiEdge: true, aiClickToDo: true, msBgApps: true, suggestions: true, adId: true, tailored: true, startRecs: true, widgets: true, chatButton: true, webSearch: true, msLockSpot: true, msSettingsAds: true, msOneDriveNag: true, msSearchHighlights: true, msErrorReport: true, msSpeechOnline: true, msTypingLearn: true, msLangOptOut: true, msEdgePromos: true, msEdgeBg: true } },
  aiAllOn: { dwords: {}, toggles: { aiMachine: true, aiCopilot: true, copilotButton: true, aiRecall: true, aiEdge: true, aiClickToDo: true, webSearch: true } }
};
async function applyPreset(name) {
  const p = PRESETS[name]; if (!p) throw new Error('Unknown preset');
  const failed = [];
  for (const [id, v] of Object.entries(p.toggles)) { try { await toggleSet(id, v, true); } catch (e) { failed.push(id + ': ' + String((e && e.message) || e)); } }
  for (const [id, v] of Object.entries(p.dwords)) { const d = DWORDS[id]; await ps(`if (-not (Test-Path ${q(d.path)})) { New-Item -Path ${q(d.path)} -Force | Out-Null }; New-ItemProperty -Path ${q(d.path)} -Name ${q(d.name)} -Value ${v} -PropertyType DWord -Force | Out-Null`); }
  await ps(restartExplorer);
  if (failed.length) throw new Error('Done, except: ' + failed.join(' | '));
  return true;
}

/* ---------- Audio (Core Audio via inline C#) ---------- */
const AUDIO_CS = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, System.Guid ctx); int j();
  int GetMasterVolumeLevelScalar(out float level); int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, System.Guid ctx);
  int GetMute(out bool mute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-4F03-9F5C-2AE5CA5CA2BF")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() { var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d); IAudioEndpointVolume v; var g = typeof(IAudioEndpointVolume).GUID; d.Activate(ref g, 23, 0, out v); return v; }
  public static float Get() { float l; Vol().GetMasterVolumeLevelScalar(out l); return l; }
  public static void Set(float l) { Vol().SetMasterVolumeLevelScalar(l, System.Guid.Empty); }
  public static bool Muted() { bool m; Vol().GetMute(out m); return m; }
  public static void Mute(bool m) { Vol().SetMute(m, System.Guid.Empty); }
}
'@
`;

/* ---------- CPU sampling (cross-platform) ---------- */
let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] || c;
    for (const k of Object.keys(c.times)) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  lastCpu = now;
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

/* ---------- Handlers ---------- */
const guid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;

async function gpuNames() {
  const { execFile } = require('child_process'); const run = (c, a) => new Promise((ok) => execFile(c, a, { timeout: 8000, windowsHide: true, encoding: 'utf8' }, (e, o) => ok(e ? '' : String(o))));
  let out = '';
  if (process.platform === 'win32') out = await run('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name']);
  else if (process.platform === 'linux') out = (await run('lspci', [])).split('\n').filter((l) => /VGA|3D|Display/.test(l)).map((l) => l.split(':').slice(2).join(':').trim()).join('\n');
  else if (process.platform === 'darwin') out = (await run('system_profiler', ['SPDisplaysDataType'])).split('\n').filter((l) => /Chipset Model/.test(l)).map((l) => l.split(':')[1].trim()).join('\n');
  return out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
}


/* ---------- Mouse pointer problems (pointer vanishing) ---------- */
const CURSOR_PS = `Add-Type -Namespace Aur -Name Ptr -MemberDefinition '
[DllImport("user32.dll",EntryPoint="SystemParametersInfo")] public static extern bool GetB(uint a,uint b,out bool c,uint d);
[DllImport("user32.dll",EntryPoint="SystemParametersInfo")] public static extern bool GetI(uint a,uint b,out int c,uint d);
[DllImport("user32.dll",EntryPoint="SystemParametersInfo")] public static extern bool SetP(uint a,uint b,IntPtr c,uint d);'
function Read { $v=$false; $t=0; $s=$false; [Aur.Ptr]::GetB(0x1020,0,[ref]$v,0) | Out-Null; [Aur.Ptr]::GetI(0x5E,0,[ref]$t,0) | Out-Null; [Aur.Ptr]::GetB(0x101C,0,[ref]$s,0) | Out-Null; '{"vanish":' + $v.ToString().ToLower() + ',"trails":' + $t + ',"sonar":' + $s.ToString().ToLower() + '}' }`;
const handlers = {
  diskScan: async ({ root }) => { const r = typeof root === 'string' && root ? root : (isWin ? 'C:\\' : os.homedir()); return require('./lib/diskscan').scan(r, {}); },
  diskRoots: async () => { const o = [{ name: 'Home', path: os.homedir() }]; if (isWin) { for (const l of 'CDEFGHIJ') { const d = l + ':\\'; try { if (fs.existsSync(d)) o.push({ name: l + ':', path: d }); } catch (_) {} } } else o.push({ name: 'System (/)', path: '/' }); return o; },
  diskReveal: async (a) => { const p = a && (a.p || a.path); if (typeof p !== 'string' || !p || !fs.existsSync(p)) throw new Error('That path no longer exists'); shell.showItemInFolder(path.resolve(p)); return true; },
  dupScanPath: async (a) => { const root = a && typeof a.root === 'string' && a.root.trim() ? a.root.trim() : os.homedir(); const mb = Math.max(0.1, Math.min(10000, Number(a && a.minMB) || 1)); return require('./lib/dupscan').scan(root, { minSize: Math.round(mb * 1048576) }); },
  // ---- Vorynth Doctor ----
  doctorScan: async () => {
    const D = require('./lib/doctor'); let facts;
    if (isWin) { const out = await ps(D.WIN_PROBE, 90000); const line = String(out).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{')).pop(); if (!line) throw new Error('The hardware scan returned nothing'); facts = JSON.parse(line); } else facts = await D.nodeProbe();
    const findings = D.evaluate(facts); let undoable = []; try { undoable = Object.keys(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'doctor-tweaks.json'), 'utf8'))); } catch (_) {}
    return { platform: process.platform, at: Date.now(), findings, score: D.score(findings), hw: facts.hw || {}, gaming: D.evaluateGaming(facts.gaming), undoable };
  },
  doctorFix: async (a) => {
    const D = require('./lib/doctor'); const id = a && a.id; if (typeof id !== 'string') throw new Error('Unknown fix');
    if (!isWin) throw new Error('Fixes run on Windows only');
    if (id === 'cleantemp') { await handlers.cleanTemp(); return { done: true }; }
    if (id === 'driverupdate') { await handlers.wuInstall({ all: true, drivers: true }); return { done: true }; }
    if (id === 'restorecheck' || !Object.prototype.hasOwnProperty.call(D.FIXES, id)) throw new Error('Unknown fix');
    const fx = D.FIXES[id];
    if (fx.detached) { await elevateDetached(fx.script); return { started: true }; }
    if (fx.admin) await elevate(fx.script, 600000); else await ps(fx.script, 120000);
    if (id === 'restorepoint') { // the elevated window hides its errors, so confirm the point really exists
      let when = ''; try { when = String(await ps(D.FIXES.restorecheck.script, 30000)).trim(); } catch (_) {}
      const fresh = when && Date.now() - Date.parse(when) < 15 * 60 * 1000; return { done: true, verified: when ? !!fresh : null };
    }
    return { done: true };
  },
  doctorTweak: async (a) => {
    const D = require('./lib/doctor'); const name = a && a.name; if (!isWin) throw new Error('Gaming tweaks run on Windows only'); if (!D.TWEAK_NAMES.includes(name)) throw new Error('Unknown tweak');
    const file = path.join(app.getPath('userData'), 'doctor-tweaks.json'); let saved = {}; try { saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) {}
    if (a.undo) { const prev = saved[name]; if (!D.validPrev(name, prev)) throw new Error('Nothing saved to undo for this tweak'); await ps(D.tweakUndoScript(name, prev), 30000); delete saved[name]; fs.writeFileSync(file, JSON.stringify(saved)); return { done: true, undone: true }; }
    const out = await ps(D.tweakApplyScript(name), 30000); const prev = D.parsePrev(out);
    if (saved[name] == null && D.validPrev(name, prev)) { saved[name] = prev; fs.writeFileSync(file, JSON.stringify(saved)); }
    return { done: true };
  },
  diagReport: async (a) => { // one readable report: this PC, whether Windows changes work, every switch, and the errors the app has hit
    const L = []; const add = (k, v) => L.push(k.padEnd(26) + String(v)); const home = os.homedir();
    const clean = (t) => String(t == null ? '' : t).split(home).join('~').replace(/\\Users\\[^\\\s"']+/gi, '\\Users\\<user>').slice(0, 600);
    L.push('Vorynth Settings diagnostics', new Date().toISOString(), '');
    add('App version', app.getVersion()); add('Electron / Node', process.versions.electron + ' / ' + process.versions.node); add('Platform', process.platform + ' ' + os.release() + ' ' + os.arch());
    add('Run from', clean(process.execPath)); if (process.env.PORTABLE_EXECUTABLE_DIR) add('Portable folder', clean(process.env.PORTABLE_EXECUTABLE_DIR));
    if (/\\Temp\\|\\AppData\\Local\\Temp/i.test(process.execPath)) L.push('  WARNING: running from a Temp folder. Extract the zip first, then run the app from the extracted folder.');
    add('RAM', Math.round(os.totalmem() / 1073741824) + ' GB'); add('Language', app.getLocale());
    if (isWin) {
      L.push('', '--- Windows checks ---');
      try {
        const raw = await ps(`$o = [ordered]@{}; $o.powershell = $PSVersionTable.PSVersion.ToString(); $o.languageMode = [string]$ExecutionContext.SessionState.LanguageMode
$o.admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
try { $w = Get-CimInstance Win32_OperatingSystem; $o.windows = $w.Caption + ' ' + $w.Version + ' build ' + $w.BuildNumber } catch { $o.windows = 'ERR ' + $_.Exception.Message }
try { $o.edition = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion').EditionID } catch { $o.edition = 'ERR' }
try { $k = 'HKCU:\\Software\\AuroraDiag'; New-Item -Path $k -Force | Out-Null; New-ItemProperty -Path $k -Name t -Value 1 -PropertyType DWord -Force | Out-Null; $o.registryWriteUser = ((Get-ItemProperty $k).t -eq 1); Remove-Item $k -Force -Recurse } catch { $o.registryWriteUser = 'ERR ' + $_.Exception.Message }
try { $k = 'HKCU:\\Software\\Policies\\AuroraDiag'; New-Item -Path $k -Force | Out-Null; $o.registryWritePolicy = $true; Remove-Item $k -Force -Recurse } catch { $o.registryWritePolicy = 'ERR ' + $_.Exception.Message }
$o.explorerRunning = [bool](Get-Process explorer -ErrorAction SilentlyContinue)
try { $o.defenderRealtime = (Get-MpComputerStatus -ErrorAction Stop).RealTimeProtectionEnabled } catch { $o.defenderRealtime = 'unknown' }
try { $o.controlledFolderAccess = (Get-MpPreference -ErrorAction Stop).EnableControlledFolderAccess } catch { $o.controlledFolderAccess = 'unknown' }
try { $o.pointerVanishCheck = (Get-ItemProperty 'HKCU:\\Control Panel\\Mouse').MouseSpeed } catch { $o.pointerVanishCheck = 'unknown' }
$o | ConvertTo-Json -Compress`, 60000);
        const j = JSON.parse(String(raw).trim().split('\n').pop()); for (const [k, v] of Object.entries(j)) add(k, clean(v));
      } catch (e) { L.push('  Windows checks failed: ' + clean(e.message || e)); }
      L.push('', '--- Switches (what Vorynth reads from Windows) ---');
      const ids = Object.keys(TOGGLES);
      try { const r = await toggleGetMany(ids); L.push(ids.map((id) => id + '=' + (r[id] === true ? 'on' : r[id] === false ? 'off' : String(r[id]))).join('  ')); } catch (e) { L.push('  Reading the switches failed: ' + clean(e.message || e)); }
    } else L.push('', 'Not Windows: the Windows checks are skipped.');
    L.push('', '--- Errors the app hit this session ---');
    const errs = Array.isArray(a && a.errors) ? a.errors.slice(-40) : []; if (!errs.length) L.push('  none recorded'); for (const e of errs) L.push('  ' + clean(e.at) + '  ' + clean(e.call) + '  ->  ' + clean(e.error));
    return L.join('\n');
  },
  diagSave: async ({ text }) => { let dir = app.getPath('desktop'); try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); } catch (_) { dir = app.getPath('documents'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { dir = app.getPath('userData'); } } const f = path.join(dir, 'Vorynth-diagnostics.txt'); fs.writeFileSync(f, String(text || ''), 'utf8'); try { shell.showItemInFolder(f); } catch (_) { /* ignore */ } return f; },
  cursorState: async () => JSON.parse(String(await ps(CURSOR_PS + '\nRead')).trim().split('\n').pop()),
  cursorFix: async () => { // switches off the usual causes of a vanishing pointer and reloads the pointer images
    await ps(CURSOR_PS + `
[Aur.Ptr]::SetP(0x1021,0,[IntPtr]0,3) | Out-Null      # hide pointer while typing: off
[Aur.Ptr]::SetP(0x5D,0,[IntPtr]0,3) | Out-Null        # pointer trails: off
[Aur.Ptr]::SetP(0x101D,0,[IntPtr]1,3) | Out-Null      # show pointer location when Ctrl is pressed: on
[Aur.Ptr]::SetP(0x57,0,[IntPtr]0,0) | Out-Null        # reload the pointer images
Read`);
    return JSON.parse(String(await ps(CURSOR_PS + '\nRead')).trim().split('\n').pop());
  },
  stats: async () => ({
    cpu: cpuPercent(),
    ramUsed: os.totalmem() - os.freemem(),
    ramTotal: os.totalmem(),
    uptime: os.uptime()
  }),

  toggleGet: (a) => toggleGet(a.id),
  toggleGetMany: (a) => toggleGetMany(a.ids),
  toggleSet: (a) => toggleSet(a.id, !!a.value, !!a.defer),
  dwordGet: (a) => dwordGet(a.id),
  dwordSet: (a) => dwordSet(a.id, a.value),
  applyPreset: (a) => applyPreset(a.name),
  restartExplorer: async () => { await ps(restartExplorer); return true; },

  sysinfo: async () => {
    if (!isWin) return linuxSysinfo();
    const out = await ps(`
$os=Get-CimInstance Win32_OperatingSystem; $cs=Get-CimInstance Win32_ComputerSystem
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu=(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ', '
$bios=Get-CimInstance Win32_BIOS
[pscustomobject]@{device=$env:COMPUTERNAME;os=$os.Caption;build=$os.BuildNumber;version=$os.Version;arch=$os.OSArchitecture;cpu=$cpu.Name;cores=$cpu.NumberOfCores;threads=$cpu.NumberOfLogicalProcessors;gpu=$gpu;ramGB=[math]::Round($cs.TotalPhysicalMemory/1GB,1);maker=$cs.Manufacturer;model=$cs.Model;bios=$bios.SMBIOSBIOSVersion} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },

  display: async () => {
    const out = await ps(`Get-CimInstance Win32_VideoController | ForEach-Object { [pscustomobject]@{name=$_.Name;w=$_.CurrentHorizontalResolution;h=$_.CurrentVerticalResolution;hz=$_.CurrentRefreshRate} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },

  drives: async () => {
    if (!isWin) { const o = require('child_process').execFileSync('df', ['-B1', '--output=target,used,avail', '/', '/home'], { encoding: 'utf8', timeout: 4000 }).trim().split('\n').slice(1); const seen = new Set(); const r = []; for (const l of o) { const p = l.trim().split(/\s+/); if (p.length < 3 || seen.has(p[0])) continue; seen.add(p[0]); r.push({ name: p[0] === '/' ? 'C' : p[0], used: Number(p[1]), free: Number(p[2]) }); } return r; }
    const out = await ps(`Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object { [pscustomobject]@{name=$_.Name;used=[int64]$_.Used;free=[int64]$_.Free} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },

  battery: async () => {
    const out = await ps(`$b=Get-CimInstance Win32_Battery; if($b){[pscustomobject]@{percent=$b.EstimatedChargeRemaining;charging=($b.BatteryStatus -eq 2)} | ConvertTo-Json -Compress}`);
    return out ? JSON.parse(out) : null;
  },

  network: async () => {
    const out = await ps(`Get-NetAdapter | ForEach-Object { $ip=(Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress; [pscustomobject]@{name=$_.Name;status="$($_.Status)";speed=$_.LinkSpeed;mac=$_.MacAddress;ip=$ip} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },

  wifiList: async () => {
    const out = await ps('netsh wlan show networks mode=bssid');
    const names = [...out.matchAll(/^\s*SSID\s+\d+\s*:\s*(.*)$/gm)].map((m) => m[1].trim()).filter(Boolean);
    return [...new Set(names)];
  },

  apps: async () => {
    const out = await ps(`
$p='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Sort-Object DisplayName -Unique | ForEach-Object { [pscustomobject]@{name=$_.DisplayName;version=$_.DisplayVersion;publisher=$_.Publisher} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },

  startup: async () => {
    const out = await ps(`Get-CimInstance Win32_StartupCommand | ForEach-Object { [pscustomobject]@{name=$_.Name;command=$_.Command;location=$_.Location} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },

  volumeGet: async () => {
    const out = await ps(AUDIO_CS + `; [pscustomobject]@{volume=[math]::Round([Audio]::Get()*100);muted=[Audio]::Muted()} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  volumeSet: async (a) => {
    if (!Number.isFinite(Number(a.value))) throw new Error('Bad value');
    const v = Math.max(0, Math.min(100, Number(a.value))) / 100;
    await ps(AUDIO_CS + `; [Audio]::Set(${v.toFixed(2)})`);
    return true;
  },
  muteSet: async (a) => {
    await ps(AUDIO_CS + `; [Audio]::Mute($${a.value ? 'true' : 'false'})`);
    return true;
  },

  brightnessGet: async () => {
    const out = await ps(`(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness`);
    return Number(out);
  },
  brightnessSet: async (a) => {
    if (!Number.isFinite(Number(a.value))) throw new Error('Bad value');
    const v = Math.max(0, Math.min(100, Math.round(Number(a.value))));
    await ps(`(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop) | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=1;Brightness=${v}} | Out-Null`);
    return true;
  },

  powerPlans: async () => {
    const out = await ps('powercfg /list');
    return [...out.matchAll(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.+?)\)(\s*\*)?/gi)].map((m) => ({ guid: m[1], name: m[2], active: !!m[3] }));
  },
  powerSet: async (a) => {
    if (!guid.test(a.guid)) throw new Error('Bad GUID');
    await ps(`powercfg /setactive ${a.guid}`);
    return true;
  },

  tempSize: async () => {
    const out = await ps(`(Get-ChildItem $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum`, 180000);
    return Number(out) || 0;
  },
  cleanTemp: async () => {
    const out = await ps(`
$before=(Get-ChildItem $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
Get-ChildItem $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$after=(Get-ChildItem $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
[int64]($before - $after)`, 300000);
    return Number(out) || 0;
  },

  dnsSet: async (a) => {
    const presets = { cloudflare: ['1.1.1.1', '1.0.0.1'], google: ['8.8.8.8', '8.8.4.4'], quad9: ['9.9.9.9', '149.112.112.112'], auto: null };
    if (!(a.preset in presets)) throw new Error('Bad preset');
    const servers = presets[a.preset];
    if (servers && !servers.every((s) => ipv4.test(s))) throw new Error('Bad address');
    const body = servers
      ? `Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses ${servers.map(q).join(',')} }`
      : `Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses }`;
    const encoded = Buffer.from(body, 'utf16le').toString('base64');
    // Needs admin: triggers the normal UAC prompt.
    await ps(`Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`);
    return true;
  },

  flushDns: async () => {
    await ps('Clear-DnsClientCache');
    return true;
  },


  /* ----- Vorynth extras ----- */
  processes: async () => {
    const out = await ps(`Get-Process | Where-Object { $_.ProcessName -ne 'Idle' } | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{name=$_.Name;count=$_.Count;mem=[int64](($_.Group | Measure-Object WorkingSet64 -Sum).Sum);cpu=[math]::Round((($_.Group | Measure-Object CPU -Sum).Sum),1)} } | Sort-Object mem -Descending | Select-Object -First 15 | ConvertTo-Json -Compress`);
    return asJson(out);
  },
  killProcess: async (a) => {
    const name = String(a.name || '');
    const deny = ['system', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'svchost', 'dwm', 'fontdrvhost', 'memcompression', 'explorer'];
    if (!/^[\w. -]{1,64}$/.test(name) || deny.includes(name.toLowerCase())) throw new Error('This process is protected');
    await ps(`Stop-Process -Name ${q(name)} -Force -ErrorAction Stop`);
    return true;
  },
  ping: (a) => new Promise((resolve, reject) => {
    if (!/^[a-z0-9.-]{1,64}$/i.test(String(a.host || ''))) return reject(new Error('Bad host'));
    execFile('ping', ['-n', '1', '-w', '1500', a.host], { windowsHide: true, timeout: 5000 }, (_e, out) => {
      const m = /[=<]\s*(\d+)\s*[^\d\s]{0,12}\s+TTL/i.exec(out || '') || /[=<]\s*(\d+)\s*ms/i.exec(out || '');
      resolve(m ? Number(m[1]) : null);
    });
  }),
  dnsBench: async () => {
    const out = await ps(`
$d='google.com','microsoft.com','wikipedia.org','amazon.com','github.com'
$s=@(@{n='System default';a=$null;p='auto'},@{n='Cloudflare';a='1.1.1.1';p='cloudflare'},@{n='Google';a='8.8.8.8';p='google'},@{n='Quad9';a='9.9.9.9';p='quad9'})
$s | ForEach-Object { $x=$_; $t=@(); foreach($dom in $d){ $sw=[Diagnostics.Stopwatch]::StartNew(); try{ if($x.a){Resolve-DnsName $dom -Server $x.a -Type A -DnsOnly -QuickTimeout -ErrorAction Stop | Out-Null}else{Resolve-DnsName $dom -Type A -DnsOnly -QuickTimeout -ErrorAction Stop | Out-Null}; $t+=$sw.Elapsed.TotalMilliseconds }catch{} }; [pscustomobject]@{name=$x.n;preset=$x.p;ms=$(if($t.Count){[math]::Round(($t | Measure-Object -Average).Average)}else{$null})} } | ConvertTo-Json -Compress`, 90000);
    return asJson(out);
  },
  diskHealth: async () => {
    const out = await ps(`Get-PhysicalDisk | ForEach-Object { [pscustomobject]@{name=$_.FriendlyName;type="$($_.MediaType)";health="$($_.HealthStatus)";size=[int64]$_.Size} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },
  recycleSize: async () => {
    const out = await ps(`$i=(New-Object -ComObject Shell.Application).NameSpace(0xA).Items(); [int64](($i | ForEach-Object { $_.Size } | Measure-Object -Sum).Sum)`);
    return Number(out) || 0;
  },
  emptyBin: async () => { await ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue'); return true; },

  autoThemeGet: async () => {
    const out = await ps(`$r=@{}; foreach($n in 'AuroraThemeLight','AuroraThemeDark'){ $t=Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue; if($t){ $r[$n]=([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm') } }; $r | ConvertTo-Json -Compress`);
    const o = out ? JSON.parse(out) : {};
    return o.AuroraThemeLight && o.AuroraThemeDark ? { enabled: true, lightAt: o.AuroraThemeLight, darkAt: o.AuroraThemeDark } : { enabled: false };
  },
  autoThemeSet: async (a) => {
    if (!a.enabled) {
      await ps(`foreach($n in 'AuroraThemeLight','AuroraThemeDark'){ Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }`);
      return true;
    }
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hhmm.test(a.lightAt) || !hhmm.test(a.darkAt)) throw new Error('Bad time');
    const mk = (name, at, val) => `
$act=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -Command "Set-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name AppsUseLightTheme -Value ${val}; Set-ItemProperty -Path HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize -Name SystemUsesLightTheme -Value ${val}"'
$trg=New-ScheduledTaskTrigger -Daily -At '${at}'
$set=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName '${name}' -Action $act -Trigger $trg -Settings $set -Force | Out-Null`;
    await ps(mk('AuroraThemeLight', a.lightAt, 1) + '\n' + mk('AuroraThemeDark', a.darkAt, 0));
    return true;
  },

  setWallpaper: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }] });
    if (r.canceled) return 'Cancelled';
    await ps(`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Wp { [DllImport("user32.dll",CharSet=CharSet.Auto)] public static extern int SystemParametersInfo(int a,int b,string c,int d); }'; [void][Wp]::SystemParametersInfo(20,0,${q(r.filePaths[0])},3)`);
    return 'Wallpaper updated';
  },

  /* ----- Windows Update ----- */
  wuInfo: async () => {
    const out = await ps(`
$cv=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$svc=Get-Service wuauserv
$reboot=(Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending')
$last=$null; try { $last=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\Results\\Detect').LastSuccessTime } catch {}
[pscustomobject]@{product=$cv.ProductName;display=$cv.DisplayVersion;build=[int]$cv.CurrentBuild;ubr=[int]$cv.UBR;service="$($svc.Status)";startType="$($svc.StartType)";reboot=[bool]$reboot;lastCheck=$last} | ConvertTo-Json -Compress`);
    const o = JSON.parse(out);
    if (o.build >= 22000) o.product = String(o.product).replace('Windows 10', 'Windows 11'); // registry still says "10" on Windows 11
    return o;
  },
  wuHistory: async () => {
    const out = await ps(`
$se=(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
$n=$se.GetTotalHistoryCount()
if ($n -gt 0) { $se.QueryHistory(0,[math]::Min($n,40)) | Where-Object { $_.Title } | ForEach-Object { [pscustomobject]@{title=$_.Title;date=$_.Date.ToString('yyyy-MM-dd');result=[int]$_.ResultCode} } | ConvertTo-Json -Compress }`, 90000);
    return asJson(out);
  },

  /* ----- Devices ----- */
  devices: async () => {
    const out = await ps(`Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -and ($_.Class -in 'Bluetooth','Mouse','Keyboard','Monitor','Camera','Image','PrintQueue','AudioEndpoint') } | ForEach-Object { [pscustomobject]@{cls="$($_.Class)";name=$_.FriendlyName} } | Sort-Object cls,name -Unique | ConvertTo-Json -Compress`, 60000);
    return asJson(out).filter((d) => !/Enumerator|RFCOMM|Protocol|Transport|Generic Attribute|Device Information|Microsoft Bluetooth|Print to PDF|XPS|OneNote|Fax/i.test(d.name));
  },

  /* ----- Startup manager (same switches Task Manager uses) ----- */
  startupList: async () => {
    const out = await ps(`
$keys=@(
 @{p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';a='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';s='user'},
 @{p='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';a='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';s='machine'},
 @{p='HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run';a='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32';s='machine'})
$skip='PSPath','PSParentPath','PSChildName','PSDrive','PSProvider'
$out=@()
foreach($k in $keys){
  $props=Get-ItemProperty -Path $k.p -ErrorAction SilentlyContinue
  if(-not $props){continue}
  $ap=Get-ItemProperty -Path $k.a -ErrorAction SilentlyContinue
  foreach($pr in $props.PSObject.Properties){
    if($skip -contains $pr.Name){continue}
    $en=$true
    if($ap -and $ap.PSObject.Properties[$pr.Name]){ $b=$ap.PSObject.Properties[$pr.Name].Value; if($b -and ($b[0] -band 1)){$en=$false} }
    $out+=[pscustomobject]@{name=$pr.Name;command="$($pr.Value)";scope=$k.s;enabled=$en}
  }
}
ConvertTo-Json @($out) -Compress`);
    return asJson(out);
  },
  startupSet: async (a) => {
    const name = String(a.name || '');
    if (!name || name.length > 200) throw new Error('Bad name');
    const bytes = a.enabled ? '2,0,0,0,0,0,0,0,0,0,0,0' : '3,0,0,0,0,0,0,0,0,0,0,0';
    await ps(`
$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; $a='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
if (-not (Get-ItemProperty -Path $k).PSObject.Properties[${q(name)}]) { throw 'That startup entry was not found' }
if (-not (Test-Path $a)) { New-Item -Path $a -Force | Out-Null }
New-ItemProperty -Path $a -Name ${q(name)} -PropertyType Binary -Value ([byte[]](${bytes})) -Force | Out-Null`);
    return true;
  },

  /* ----- Time, accounts, power ----- */
  timeInfo: async () => {
    const out = await ps(`$tz=Get-TimeZone; $langs=(Get-WinUserLanguageList | ForEach-Object { $_.LanguageTag }) -join ', '
[pscustomobject]@{tz=$tz.Id;tzName=$tz.DisplayName;culture=(Get-Culture).DisplayName;ui=(Get-UICulture).DisplayName;langs=$langs;now=(Get-Date).ToString('yyyy-MM-dd HH:mm')} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  timeZones: async () => {
    const out = await ps(`Get-TimeZone -ListAvailable | ForEach-Object { [pscustomobject]@{id=$_.Id;name=$_.DisplayName} } | ConvertTo-Json -Compress`);
    return asJson(out);
  },
  timeZoneSet: async (a) => {
    const list = await handlers.timeZones();
    if (!list.some((z) => z.id === a.id)) throw new Error('Unknown time zone');
    await elevate(`Set-TimeZone -Id ${q(a.id)}`);
    return true;
  },
  timeSync: async () => { await elevate('Start-Service w32time -ErrorAction SilentlyContinue; w32tm /resync /force'); return true; },
  firstDayGet: async () => (await ps(`(Get-ItemProperty -Path 'HKCU:\\Control Panel\\International').iFirstDayOfWeek`)),
  firstDaySet: async (a) => {
    if (!['0', '5', '6'].includes(String(a.value))) throw new Error('Bad value'); // 0 Monday, 5 Saturday, 6 Sunday
    await ps(`Set-ItemProperty -Path 'HKCU:\\Control Panel\\International' -Name iFirstDayOfWeek -Value '${a.value}'; rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True`);
    return true;
  },
  textScaleGet: async () => {
    const out = await ps(`(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Accessibility' -Name TextScaleFactor -ErrorAction SilentlyContinue).TextScaleFactor`);
    return Number(out) || 100;
  },
  textScaleSet: async (a) => {
    const v = Math.round(Number(a.value));
    if (!Number.isFinite(v) || v < 100 || v > 225) throw new Error('Bad value');
    await ps(`$p='HKCU:\\Software\\Microsoft\\Accessibility'; if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }; New-ItemProperty -Path $p -Name TextScaleFactor -Value ${v} -PropertyType DWord -Force | Out-Null`);
    return true;
  },
  accountInfo: async () => {
    const out = await ps(`$id=[Security.Principal.WindowsIdentity]::GetCurrent(); $p=New-Object Security.Principal.WindowsPrincipal($id)
[pscustomobject]@{user=$env:USERNAME;domain=$env:USERDOMAIN;computer=$env:COMPUTERNAME;admin=[bool]$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);profile=$env:USERPROFILE} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  powerAction: async (a) => {
    const mins = Math.max(0, Math.min(1440, Math.round(Number(a.minutes) || 0)));
    const sec = String(mins * 60);
    const run = (file, args) => new Promise((resolve, reject) => execFile(file, args, { windowsHide: true }, (e) => (e ? reject(new Error(e.message.split('\n')[0])) : resolve(true))));
    switch (a.action) {
      case 'lock': return run('rundll32.exe', ['user32.dll,LockWorkStation']);
      case 'signout': return run('shutdown.exe', ['/l']);
      case 'sleep': return run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
      case 'hibernate': return run('shutdown.exe', ['/h']);
      case 'restart': return run('shutdown.exe', ['/r', '/t', sec, '/c', 'Vorynth Settings']);
      case 'shutdown': return run('shutdown.exe', ['/s', '/t', sec, '/c', 'Vorynth Settings']);
      case 'cancel': return run('shutdown.exe', ['/a']).catch(() => false); // nothing scheduled -> false
      default: throw new Error('Unknown action');
    }
  },

  /* ----- Labs: things Windows does not give you ----- */
  batteryHealth: async () => {
    const f = path.join(os.tmpdir(), 'aurora-battery-' + process.pid + '.xml');
    await ps(`powercfg /batteryreport /xml /output ${q(f)} | Out-Null`);
    let xml = '';
    try { xml = fs.readFileSync(f, 'utf8'); } finally { try { fs.rmSync(f, { force: true }); } catch (_) {} }
    return parseBatteryXml(xml);
  },
  speedTest: () => runSpeedTest(),
  keepAwakeGet: async () => ({ mode: awake.mode, endsAt: awake.endsAt }),
  keepAwakeSet: async (a) => {
    awakeStop();
    if (a.mode === 'off') return { mode: 'off', endsAt: 0 };
    if (!['system', 'display'].includes(a.mode)) throw new Error('Bad mode');
    const mins = Math.max(0, Math.min(1440, Math.round(Number(a.minutes) || 0)));
    awake.id = powerSaveBlocker.start(a.mode === 'display' ? 'prevent-display-sleep' : 'prevent-app-suspension');
    awake.mode = a.mode;
    if (mins > 0) { awake.endsAt = Date.now() + mins * 60000; awake.timer = setTimeout(awakeStop, mins * 60000); }
    return { mode: awake.mode, endsAt: awake.endsAt };
  },
  netActivity: async () => {
    const out = await ps(`
$names=@{}; Get-Process | ForEach-Object { $names[[int]$_.Id]=$_.ProcessName }
$listen=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{port=[int]$_.LocalPort;addr="$($_.LocalAddress)";proc=$names[[int]$_.OwningProcess]} } | Sort-Object port,proc -Unique)
$est=Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -notin '127.0.0.1','::1','0.0.0.0','::' }
$talk=@($est | Group-Object OwningProcess | ForEach-Object { [pscustomobject]@{proc=$names[[int]$_.Name];connections=$_.Count;remotes=@($_.Group | Select-Object -ExpandProperty RemoteAddress -Unique).Count} } | Sort-Object connections -Descending | Select-Object -First 15)
[pscustomobject]@{listening=$listen;talkers=$talk} | ConvertTo-Json -Depth 4 -Compress`, 60000);
    const o = JSON.parse(out || '{}');
    const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    return { listening: arr(o.listening), talkers: arr(o.talkers) };
  },
  folderSizes: async (a) => {
    const expr = rootExpr(a.key);
    const out = await ps(`
$root=${expr}
if (-not (Test-Path -LiteralPath $root)) { return }
$rows=@()
$rows += Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | ForEach-Object { $s=(Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; [pscustomobject]@{name=$_.Name;path=$_.FullName;size=[int64]$s} }
$loose=(Get-ChildItem -LiteralPath $root -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$rows += [pscustomobject]@{name='(files directly in this folder)';path=$root;size=[int64]$loose}
ConvertTo-Json @($rows | Sort-Object size -Descending | Select-Object -First 20) -Compress`, 300000);
    return asJson(out);
  },
  bigFiles: async (a) => {
    const expr = rootExpr(a.key);
    const minMB = [50, 100, 500, 1000].includes(Number(a.minMB)) ? Number(a.minMB) : 100;
    const out = await ps(`
$root=${expr}; $min=${minMB}MB
if (-not (Test-Path -LiteralPath $root)) { return }
ConvertTo-Json @(Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt $min } | Sort-Object Length -Descending | Select-Object -First 30 | ForEach-Object { [pscustomobject]@{name=$_.Name;path=$_.FullName;size=[int64]$_.Length;date=$_.LastWriteTime.ToString('yyyy-MM-dd')} }) -Compress`, 300000);
    return asJson(out);
  },
  revealFile: async (a) => { if (!insideHome(a.path)) throw new Error('That path is outside your user folder'); shell.showItemInFolder(path.resolve(a.path)); return true; },
  trashFile: async (a) => {
    if (!insideHome(a.path) || !fs.statSync(path.resolve(a.path)).isFile()) throw new Error('Only files inside your user folder can be moved to the Recycle Bin');
    await shell.trashItem(path.resolve(a.path)); return true; // recoverable: goes to the Recycle Bin
  },
  openPath: async (a) => { if (!insideHome(a.path)) throw new Error('That path is outside your user folder'); const err = await shell.openPath(path.resolve(a.path)); if (err) throw new Error(err); return true; },

  envList: async () => {
    const out = await ps(`$h=[Environment]::GetEnvironmentVariables('User'); ConvertTo-Json @($h.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{name=[string]$_;value=[string]$h[$_]} }) -Compress`);
    return asJson(out);
  },
  envSet: async (a) => {
    const name = String(a.name || ''), value = String(a.value ?? '');
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('Names may use letters, digits and underscores, and cannot start with a digit');
    if (['path', 'pathext', 'windir', 'systemroot', 'comspec', 'username', 'userprofile'].includes(name.toLowerCase())) throw new Error(name + ' is protected. Change it in the classic Windows dialog.');
    if (value.length > 4000) throw new Error('Value is too long');
    await ps(`[Environment]::SetEnvironmentVariable(${q(name)}, ${q(value)}, 'User')`);
    return true;
  },
  envDelete: async (a) => {
    const name = String(a.name || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) || ['path', 'pathext', 'windir', 'systemroot', 'comspec', 'username', 'userprofile'].includes(name.toLowerCase())) throw new Error('That variable is protected');
    await ps(`[Environment]::SetEnvironmentVariable(${q(name)}, $null, 'User')`);
    return true;
  },

  spotlightSave: async () => {
    const out = await ps(`
Add-Type -AssemblyName System.Drawing
$src=Join-Path $env:LOCALAPPDATA 'Packages\\Microsoft.Windows.ContentDeliveryManager_cw5n1h2txyewy\\LocalState\\Assets'
$dest=Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Vorynth Spotlight'
if (-not (Test-Path -LiteralPath $src)) { [pscustomobject]@{saved=0;total=0;folder=$dest;missing=$true} | ConvertTo-Json -Compress; return }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$saved=0; $total=0
foreach ($f in (Get-ChildItem -LiteralPath $src -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 150KB })) {
  try {
    $img=[System.Drawing.Image]::FromFile($f.FullName)
    try { $ok = ($img.Width -ge 1900 -and $img.Width -gt $img.Height) } finally { $img.Dispose() }
  } catch { $ok=$false }
  if ($ok) { $total++; $t=Join-Path $dest ($f.Name + '.jpg'); if (-not (Test-Path -LiteralPath $t)) { Copy-Item -LiteralPath $f.FullName -Destination $t; $saved++ } }
}
[pscustomobject]@{saved=$saved;total=$total;folder=$dest;missing=$false} | ConvertTo-Json -Compress`, 90000);
    return JSON.parse(out);
  },

  autoCleanGet: async () => {
    const out = await ps(`$t=Get-ScheduledTask -TaskName 'AuroraAutoClean' -ErrorAction SilentlyContinue
if ($t) { $tr=$t.Triggers[0]; [pscustomobject]@{enabled=$true;day="$($tr.DaysOfWeek)";time=([datetime]$tr.StartBoundary).ToString('HH:mm')} | ConvertTo-Json -Compress } else { '{"enabled":false}' }`);
    return JSON.parse(out || '{"enabled":false}');
  },
  autoCleanSet: async (a) => {
    if (!a.enabled) { await ps(`Unregister-ScheduledTask -TaskName 'AuroraAutoClean' -Confirm:$false -ErrorAction SilentlyContinue`); return true; }
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!days.includes(a.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) throw new Error('Bad schedule');
    await ps(`
$act=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -Command "Get-ChildItem $env:TEMP -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-3) } | Remove-Item -Force -ErrorAction SilentlyContinue"'
$trg=New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${a.day} -At '${a.time}'
$set=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'AuroraAutoClean' -Action $act -Trigger $trg -Settings $set -Force | Out-Null`);
    return true;
  },

  restorePoint: async () => { await elevate("Checkpoint-Computer -Description 'Vorynth Settings restore point' -RestorePointType 'MODIFY_SETTINGS'"); return true; },

  wifiPasswords: async () => {
    // One administrator prompt exports every saved profile (language-independent XML), we read the keys, then delete the files.
    const base = process.env.PUBLIC || 'C:\\Users\\Public';
    const dir = path.join(base, 'aurora-wifi-' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    try {
      await elevate(`netsh wlan export profile key=clear folder=${q(dir)} | Out-Null`);
      const list = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xml')).map((f) => parseWifiXml(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(Boolean);
      return list.sort((x, y) => x.name.localeCompare(y.name));
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  },

  /* ----- Windows Update: search, install, pause (all inside Vorynth) ----- */
  wuSearch: async (a) => {
    const criteria = a && a.drivers ? 'IsInstalled=0 and IsHidden=0' : "IsInstalled=0 and IsHidden=0 and Type='Software'";
    const out = await ps(`
$se=(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
$r=$se.Search(${q(criteria)})
if ($r.Updates.Count -gt 0) { ConvertTo-Json @($r.Updates | ForEach-Object { [pscustomobject]@{id=$_.Identity.UpdateID;title=$_.Title;sizeMB=[math]::Round($_.MaxDownloadSize/1MB,1);kb=($_.KBArticleIDs -join ',');driver=($_.Type -eq 2);needsInput=[bool]$_.InstallationBehavior.CanRequestUserInput} }) -Compress }`, 240000);
    return asJson(out);
  },
  wuInstall: async (a) => {
    // Installing everything must be asked for explicitly (all: true); otherwise a non-empty list of valid update IDs is required.
    const ids = a.all === true ? [] : a.ids;
    if (!Array.isArray(ids) || (a.all !== true && ids.length === 0) || ids.length > 200 || !ids.every((i) => typeof i === 'string' && GUID_RE.test(i))) throw new Error('Bad update list');
    const criteria = a.drivers ? 'IsInstalled=0 and IsHidden=0' : "IsInstalled=0 and IsHidden=0 and Type='Software'";
    const dir = wuDir(); fs.mkdirSync(dir, { recursive: true });
    const cur = readWuState();
    if (WU_ACTIVE.includes(cur.state.phase) && cur.ageSec < 2400) throw new Error('An update is already being installed');
    for (const f of ['state.json', 'cancel.flag']) fs.rmSync(path.join(dir, f), { force: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ phase: 'starting', current: 0, total: 0, title: '', results: [], reboot: false, error: null }));
    try { await elevateDetached(wuInstallScript(dir, ids, criteria)); }
    catch (e) {
      fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ phase: 'error', current: 0, total: 0, title: '', results: [], reboot: false, error: 'Administrator permission was declined, so nothing was installed.' }));
      throw new Error('Administrator permission was declined, so nothing was installed.');
    }
    return true;
  },
  wuProgress: async () => readWuState(),
  wuCancel: async () => { fs.mkdirSync(wuDir(), { recursive: true }); fs.writeFileSync(path.join(wuDir(), 'cancel.flag'), '1'); return true; },
  wuPauseGet: async () => {
    const out = await ps(`(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings' -Name PauseUpdatesExpiryTime -ErrorAction SilentlyContinue).PauseUpdatesExpiryTime`);
    const t = Date.parse(out);
    return !Number.isNaN(t) && t > Date.now() ? { paused: true, until: new Date(t).toISOString() } : { paused: false };
  },
  wuPauseSet: async (a) => {
    const days = Number(a.days);
    if (![0, 7, 14, 21, 28, 35].includes(days)) throw new Error('Bad number of days');
    const k = "'HKLM:\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'";
    const body = days === 0
      ? `foreach($n in 'PauseFeatureUpdatesStartTime','PauseFeatureUpdatesEndTime','PauseQualityUpdatesStartTime','PauseQualityUpdatesEndTime','PauseUpdatesStartTime','PauseUpdatesExpiryTime'){ Remove-ItemProperty -Path ${k} -Name $n -ErrorAction SilentlyContinue }`
      : `$k=${k}; if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }; $now=(Get-Date).ToUniversalTime(); $end=$now.AddDays(${days}); $f='yyyy-MM-ddTHH:mm:ssZ'
foreach($n in 'PauseFeatureUpdatesStartTime','PauseQualityUpdatesStartTime','PauseUpdatesStartTime'){ Set-ItemProperty -Path $k -Name $n -Value $now.ToString($f) }
foreach($n in 'PauseFeatureUpdatesEndTime','PauseQualityUpdatesEndTime','PauseUpdatesExpiryTime'){ Set-ItemProperty -Path $k -Name $n -Value $end.ToString($f) }`;
    await elevate(body);
    return true;
  },

  /* ----- Wi-Fi, natively ----- */
  wifiScan: async () => parseWifiScan(await runFile('netsh.exe', ['wlan', 'show', 'networks', 'mode=bssid'])),
  wifiProfilesList: async () => parseWifiProfiles(await runFile('netsh.exe', ['wlan', 'show', 'profiles'])),
  wifiCurrent: async () => ({ ssid: parseWifiCurrent(await runFile('netsh.exe', ['wlan', 'show', 'interfaces']).catch(() => '')) }),
  wifiConnect: async (a) => { if (!okName(a.name)) throw new Error('Bad network name'); return runFile('netsh.exe', ['wlan', 'connect', 'name=' + a.name]); },
  wifiDisconnect: async () => runFile('netsh.exe', ['wlan', 'disconnect']),
  wifiForget: async (a) => { if (!okName(a.name)) throw new Error('Bad network name'); return runFile('netsh.exe', ['wlan', 'delete', 'profile', 'name=' + a.name]); },
  wifiJoin: async (a) => {
    const ssid = String(a.ssid || ''), pw = String(a.password || '');
    if (!okName(ssid, 32)) throw new Error('Bad network name');
    if (pw && !(pw.length >= 8 && pw.length <= 63) && !/^[0-9a-f]{64}$/i.test(pw)) throw new Error('Wi-Fi passwords are 8 to 63 characters');
    const f = path.join(os.tmpdir(), 'aurora-wifi-' + process.pid + '-' + Date.now() + '.xml');
    fs.writeFileSync(f, buildWifiProfileXml(ssid, pw, !!a.wpa3only), 'utf8');
    try { await runFile('netsh.exe', ['wlan', 'add', 'profile', 'filename=' + f, 'user=current']); }
    finally { try { fs.rmSync(f, { force: true }); } catch (_) {} } // the file contains the password
    return runFile('netsh.exe', ['wlan', 'connect', 'name=' + ssid]);
  },

  /* ----- VPN, proxy ----- */
  vpnList: async () => {
    const out = await ps(`$a=@(Get-VpnConnection -ErrorAction SilentlyContinue); $b=@(Get-VpnConnection -AllUserConnection -ErrorAction SilentlyContinue)
ConvertTo-Json @(($a + $b) | ForEach-Object { [pscustomobject]@{name=$_.Name;server=$_.ServerAddress;status="$($_.ConnectionStatus)"} }) -Compress`);
    return asJson(out);
  },
  vpnConnect: async (a) => { if (!okName(a.name) || /^[\/-]/.test(a.name)) throw new Error('Bad VPN name'); return runFile('rasdial.exe', [a.name], 60000); },
  vpnDisconnect: async (a) => { if (!okName(a.name) || /^[\/-]/.test(a.name)) throw new Error('Bad VPN name'); return runFile('rasdial.exe', [a.name, '/disconnect'], 60000); },
  proxyGet: async () => {
    const out = await ps(`$k=Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; [pscustomobject]@{enabled=([int]$k.ProxyEnable -eq 1);server="$($k.ProxyServer)";bypass="$($k.ProxyOverride)"} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  proxySet: async (a) => {
    const server = String(a.server || ''), bypass = String(a.bypass || '');
    if (a.enabled && !/^[A-Za-z0-9._\-\[\]:]{1,200}$/.test(server)) throw new Error('Enter the proxy as address:port, for example 192.168.1.5:8080');
    if (!/^[A-Za-z0-9._\-*;:<>\[\] ]{0,300}$/.test(bypass)) throw new Error('Bad bypass list');
    await ps(`$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
Set-ItemProperty -Path $k -Name ProxyEnable -Value ${a.enabled ? 1 : 0} -Type DWord
${a.enabled ? `Set-ItemProperty -Path $k -Name ProxyServer -Value ${q(server)}; Set-ItemProperty -Path $k -Name ProxyOverride -Value ${q(bypass || '<local>')}` : ''}
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Wi { [DllImport("wininet.dll")] public static extern bool InternetSetOption(System.IntPtr h, int o, System.IntPtr b, int l); }'
[void][Wi]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0); [void][Wi]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)`);
    return true;
  },

  /* ----- Mouse, printers, power timers, display ----- */
  mouseGet: async () => {
    const out = await ps(`${MOUSE_CS}
$s=0; $l=0; [void][Mo]::SystemParametersInfo(0x70,0,[ref]$s,0); [void][Mo]::SystemParametersInfo(0x68,0,[ref]$l,0)
[pscustomobject]@{speed=$s;scroll=$l;swapped=([Mo]::GetSystemMetrics(23) -ne 0)} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  mouseSet: async (a) => {
    const n = Number(a.value);
    if (a.what === 'speed' && Number.isInteger(n) && n >= 1 && n <= 20) await ps(`${MOUSE_CS}\n[void][Mo]::SystemParametersInfo(0x71,0,[IntPtr]${n},3)`);
    else if (a.what === 'scroll' && Number.isInteger(n) && n >= 1 && n <= 100) await ps(`${MOUSE_CS}\n[void][Mo]::SystemParametersInfo(0x69,${n},[IntPtr]::Zero,3)`);
    else if (a.what === 'swap' && (n === 0 || n === 1)) await ps(`${MOUSE_CS}\n[void][Mo]::SystemParametersInfo(0x21,${n},[IntPtr]::Zero,3)`);
    else throw new Error('Bad value');
    return true;
  },
  printerList: async () => {
    const out = await ps(`$def=(Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1).Name
ConvertTo-Json @(Get-Printer | ForEach-Object { [pscustomobject]@{name=$_.Name;status="$($_.PrinterStatus)";driver=$_.DriverName;isDefault=($_.Name -eq $def)} }) -Compress`);
    return asJson(out);
  },
  printerDefault: async (a) => {
    if (!okName(a.name)) throw new Error('Bad printer name');
    await ps(`$n=${q(a.name)}; if (-not (Get-Printer -Name $n -ErrorAction SilentlyContinue)) { throw 'Printer not found' }; (New-Object -ComObject WScript.Network).SetDefaultPrinter($n)`);
    return true;
  },
  powerTimeoutsGet: async () => {
    const [mon, slp] = await Promise.all([runFile('powercfg.exe', ['/query', 'SCHEME_CURRENT', 'SUB_VIDEO', 'VIDEOIDLE']), runFile('powercfg.exe', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'])]);
    return { monitor: parsePowerQuery(mon), sleep: parsePowerQuery(slp) };
  },
  powerTimeoutsSet: async (a) => {
    const map = { monitorAc: 'monitor-timeout-ac', monitorDc: 'monitor-timeout-dc', sleepAc: 'standby-timeout-ac', sleepDc: 'standby-timeout-dc' };
    if (!Object.prototype.hasOwnProperty.call(map, a.which) || !TIMEOUT_CHOICES.includes(Number(a.minutes))) throw new Error('Bad value');
    await runFile('powercfg.exe', ['/change', map[a.which], String(Number(a.minutes))]);
    return true;
  },
  displayGet: async () => {
    const out = await ps(`${DISPLAY_CS}
$cur=[Disp]::Make(); if (-not [Disp]::EnumDisplaySettings($null,-1,[ref]$cur)) { throw 'Could not read the display' }
$modes=@{}; $i=0
while ($true) { $d=[Disp]::Make(); if (-not [Disp]::EnumDisplaySettings($null,$i,[ref]$d)) { break }; $i++
  if ($d.dmBitsPerPel -eq $cur.dmBitsPerPel -and $d.dmPelsWidth -ge 800) { $modes["$($d.dmPelsWidth)x$($d.dmPelsHeight)@$($d.dmDisplayFrequency)"]=[pscustomobject]@{w=[int]$d.dmPelsWidth;h=[int]$d.dmPelsHeight;hz=[int]$d.dmDisplayFrequency} } }
[pscustomobject]@{current=[pscustomobject]@{w=[int]$cur.dmPelsWidth;h=[int]$cur.dmPelsHeight;hz=[int]$cur.dmDisplayFrequency};modes=@($modes.Values)} | ConvertTo-Json -Depth 4 -Compress`);
    const o = JSON.parse(out); o.modes = (Array.isArray(o.modes) ? o.modes : [o.modes]).sort((x, y) => y.w * y.h - x.w * x.h || y.hz - x.hz); return o;
  },
  displaySet: async (a) => {
    const w = Number(a.w), h = Number(a.h), hz = Number(a.hz);
    if (![w, h, hz].every((v) => Number.isInteger(v) && v > 0 && v < 20000)) throw new Error('Bad display mode');
    await ps(`${DISPLAY_CS}
$cur=[Disp]::Make(); [void][Disp]::EnumDisplaySettings($null,-1,[ref]$cur)
$i=0; $hit=$null
while ($true) { $d=[Disp]::Make(); if (-not [Disp]::EnumDisplaySettings($null,$i,[ref]$d)) { break }; $i++
  if ($d.dmBitsPerPel -eq $cur.dmBitsPerPel -and $d.dmPelsWidth -eq ${w} -and $d.dmPelsHeight -eq ${h} -and $d.dmDisplayFrequency -eq ${hz}) { $hit=$d; break } }
if ($null -eq $hit) { throw 'This display does not support that mode' }
$hit.dmFields = 0x80000 -bor 0x100000 -bor 0x400000
$t=[Disp]::ChangeDisplaySettings([ref]$hit, 2)
if ($t -ne 0) { throw "Windows rejected that mode (code $t)" }
$r=[Disp]::ChangeDisplaySettings([ref]$hit, 1)
if ($r -ne 0) { throw "Could not apply the mode (code $r)" }`);
    return true;
  },

  /* ----- Native replacements for Settings pages ----- */
  vpnAdd: async (a) => {
    const name = String(a.name || ''), server = String(a.server || ''), tunnel = String(a.tunnel || 'Automatic');
    if (!okName(name, 64) || /^[\/-]/.test(name)) throw new Error('Enter a name for the VPN (up to 64 characters)');
    if (!/^[A-Za-z0-9._\-:\[\]]{1,253}$/.test(server)) throw new Error('Enter the VPN server address, for example vpn.company.com');
    if (!['Automatic', 'IKEv2', 'Sstp', 'L2tp', 'Pptp'].includes(tunnel)) throw new Error('Bad tunnel type');
    await ps(`Add-VpnConnection -Name ${q(name)} -ServerAddress ${q(server)} -TunnelType ${tunnel} -RememberCredential:$${a.remember ? 'true' : 'false'} -Force`);
    return true;
  },
  vpnRemove: async (a) => {
    if (!okName(a.name, 64) || /^[\/-]/.test(a.name)) throw new Error('Bad VPN name');
    await ps(`Remove-VpnConnection -Name ${q(a.name)} -Force`);
    return true;
  },
  radiosGet: async () => {
    const out = await ps(`${RADIO_PS}\nConvertTo-Json @($radios | ForEach-Object { [pscustomobject]@{kind="$($_.Kind)";name=$_.Name;state="$($_.State)"} }) -Compress`, 40000);
    return asJson(out);
  },
  radioSet: async (a) => {
    if (!['Bluetooth', 'WiFi'].includes(a.kind) || typeof a.on !== 'boolean') throw new Error('Bad radio');
    await ps(`${RADIO_PS}
$r = $radios | Where-Object { "$($_.Kind)" -eq '${a.kind}' } | Select-Object -First 1
if (-not $r) { throw 'No ${a.kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} adapter was found' }
$res = Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]::${a.on ? 'On' : 'Off'})) ([Windows.Devices.Radios.RadioAccessStatus])
if ("$res" -ne 'Allowed') { throw "Windows did not allow that ($res)" }`, 40000);
    return true;
  },
  advancedStartup: async () => { await runFile('shutdown.exe', ['/r', '/o', '/t', '5']); return true; },

  /* ----- Alternatives to Windows tools ----- */
  servicesList: async () => {
    const out = await ps(`ConvertTo-Json @(Get-Service | Sort-Object DisplayName | ForEach-Object { [pscustomobject]@{name=$_.Name;display=$_.DisplayName;status="$($_.Status)";start="$($_.StartType)"} }) -Compress`, 60000);
    return asJson(out).map((x) => ({ ...x, core: CORE_SERVICES.includes(String(x.name).toLowerCase()) }));
  },
  serviceAction: async (a) => {
    const name = String(a.name || '');
    if (!/^[\w.$-]{1,256}$/.test(name)) throw new Error('Bad service name');
    if (!Object.prototype.hasOwnProperty.call(SERVICE_ACTIONS, a.action)) throw new Error('Bad action');
    if (CORE_SERVICES.includes(name.toLowerCase()) && a.action !== 'start') throw new Error('This is a core Windows service. Vorynth will not stop or disable it.');
    await elevate(`$n=${q(name)}; ${SERVICE_ACTIONS[a.action]}`);
    const out = await ps(`$s=Get-Service -Name ${q(name)}; [pscustomobject]@{name=$s.Name;status="$($s.Status)";start="$($s.StartType)"} | ConvertTo-Json -Compress`);
    return JSON.parse(out);
  },
  eventsRecent: async (a) => {
    const hours = [1, 6, 24, 72, 168].includes(Number(a.hours)) ? Number(a.hours) : 24;
    const levels = { errors: '1,2', warnings: '3', both: '1,2,3' }[a.level] || '1,2';
    const out = await ps(`ConvertTo-Json @(Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=${levels}; StartTime=(Get-Date).AddHours(-${hours})} -MaxEvents 80 -ErrorAction SilentlyContinue | ForEach-Object { $m=[string]$_.Message; if ($m.Length -gt 260) { $m=$m.Substring(0,260) }; [pscustomobject]@{time=$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss');log=$_.LogName;source=$_.ProviderName;id=[int]$_.Id;level=[int]$_.Level;message=$m} }) -Compress`, 90000);
    return asJson(out);
  },
  deviceProblems: async () => {
    const out = await ps(`ConvertTo-Json @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Status -in 'Error','Degraded' } | ForEach-Object { [pscustomobject]@{name=[string]$_.FriendlyName;class="$($_.Class)";status="$($_.Status)"} }) -Compress`, 60000);
    return asJson(out);
  },
  systemReport: async () => {
    const safe = async (f) => { try { return await f(); } catch (_) { return undefined; } };
    const data = { when: Date.now(), sys: await safe(() => handlers.sysinfo()), drives: await safe(() => handlers.drives()), disks: await safe(() => handlers.diskHealth()), battery: await safe(() => handlers.batteryHealth()), update: await safe(() => handlers.wuInfo()), network: await safe(() => handlers.network()), startup: await safe(() => handlers.startupList()), problems: await safe(() => handlers.deviceProblems()) };
    const r = await dialog.showSaveDialog({ defaultPath: 'pc-report.html', filters: [{ name: 'Web page', extensions: ['html'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, buildReportHtml(data), 'utf8');
    return r.filePath;
  },

  /* ----- Native replacements for Disk Management and Control Panel > Programs ----- */
  disksList: async () => {
    const out = await ps(`
$disks=@(Get-Disk | ForEach-Object { [pscustomobject]@{number=[int]$_.Number;name=[string]$_.FriendlyName;size=[int64]$_.Size;style="$($_.PartitionStyle)";health="$($_.HealthStatus)";status="$($_.OperationalStatus)";bus="$($_.BusType)"} })
$parts=@(Get-Partition -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{disk=[int]$_.DiskNumber;number=[int]$_.PartitionNumber;type="$($_.Type)";size=[int64]$_.Size;letter=$(if($_.DriveLetter){[string]$_.DriveLetter}else{''})} })
$vols=@(Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object { [pscustomobject]@{letter=[string]$_.DriveLetter;label=[string]$_.FileSystemLabel;fs=[string]$_.FileSystem;size=[int64]$_.Size;free=[int64]$_.SizeRemaining;health="$($_.HealthStatus)";type="$($_.DriveType)"} })
[pscustomobject]@{disks=$disks;partitions=$parts;volumes=$vols} | ConvertTo-Json -Depth 4 -Compress`, 60000);
    const o = JSON.parse(out || '{}'); const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    return { disks: arr(o.disks), partitions: arr(o.partitions), volumes: arr(o.volumes) };
  },
  appUninstall: async (a) => {
    const name = String(a.name || '');
    if (!name || name.length > 300 || /[\u0000-\u001f]/.test(name)) throw new Error('Bad app name');
    // The command is read from the installer's own registry entry here, never from the UI.
    await ps(`$n=${q(name)}
$paths='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
$e=Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq $n } | Select-Object -First 1
if (-not $e) { throw 'That app was not found' }
$cmd=if ($e.UninstallString) { [string]$e.UninstallString } else { [string]$e.QuietUninstallString }
if (-not $cmd) { throw 'This app does not have an uninstaller' }
Start-Process -FilePath cmd.exe -ArgumentList ('/c "' + $cmd + '"')`);
    return true;
  },

  exportSettings: async (a) => {
    const r = await dialog.showSaveDialog({ defaultPath: 'aurora-settings-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(a.data, null, 2));
    return r.filePath;
  },
  importSettings: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
  }
};

/* ---------- Automation, tray, startup and extra tools (see lib/) ---------- */
let mainWin = null, quitting = false, trayNoteShown = false;
const showMainWindow = () => { if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } };
const toggleMainWindow = () => { if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible() && mainWin.isFocused()) mainWin.hide(); else showMainWindow(); };
const integration = require('./lib/integration').createIntegration({
  electron, handlers, TOGGLES, runFile, userDataDir: app.getPath('userData'),
  iconPath: path.join(__dirname, 'build', 'icon.png'),
  exePath: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, // the portable build runs from a temp folder: auto-start must point at the real .exe
  showWindow: showMainWindow, toggleWindow: toggleMainWindow, summon: () => { showMainWindow(); try { mainWin.webContents.send('summon'); } catch (_) {} }, quitApp: () => { quitting = true; app.quit(); },
  qr: (() => { try { return require('qrcode'); } catch (_) { return { toString: async () => { throw new Error('QR support is missing'); } }; } })()
});
Object.assign(handlers, integration.handlers);
/* ---------- Pad (text editor) file access: only files the user picks in a dialog ---------- */
const padOk = new Set();
Object.assign(handlers, {
  padOpen: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Text files', extensions: ['txt', 'md', 'json', 'csv', 'log', 'js', 'html', 'css', 'xml', 'ini', 'bat', 'py'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0]; const st = fs.statSync(p);
    if (st.size > 5 * 1024 * 1024) throw new Error('That file is too big for Pad (limit 5 MB)');
    const buf = fs.readFileSync(p); if (buf.includes(0)) throw new Error('That looks like a program or picture, not a text file');
    padOk.add(path.resolve(p)); return { path: p, name: path.basename(p), text: buf.toString('utf8') };
  },
  padSave: async ({ text, path: target, name }) => {
    if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) throw new Error('Nothing to save');
    let p = typeof target === 'string' && target && padOk.has(path.resolve(target)) ? target : '';
    if (!p) { const r = await dialog.showSaveDialog({ defaultPath: String(name || 'Untitled') + (/\.[\w]+$/.test(String(name)) ? '' : '.txt'), filters: [{ name: 'Text file', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }] }); if (r.canceled || !r.filePath) return null; p = r.filePath; }
    fs.writeFileSync(p, text, 'utf8'); padOk.add(path.resolve(p)); return { path: p, name: path.basename(p) };
  }
});
/* ---------- Snap (screenshots), clipboard image and QR for Vorynth Apps ---------- */
Object.assign(handlers, {
  screenSnap: async () => {
    const { screen, desktopCapturer } = electron;
    const d = screen.getPrimaryDisplay(), sf = d.scaleFactor || 1;
    const w = Math.round(d.size.width * sf), h = Math.round(d.size.height * sf);
    const hide = mainWin && !mainWin.isDestroyed() && mainWin.isVisible();
    if (hide) { mainWin.hide(); await new Promise((r) => setTimeout(r, 450)); } // let the window disappear so it is not in the picture
    try {
      const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
      const src = srcs.find((x) => String(x.display_id) === String(d.id)) || srcs[0];
      if (!src) throw new Error('No screen was found to capture');
      const size = src.thumbnail.getSize();
      if (!size.width || !size.height) throw new Error('The screenshot came back empty. Another app may be blocking screen capture.');
      return { dataUrl: src.thumbnail.toDataURL(), w: size.width, h: size.height };
    } finally { if (hide) showMainWindow(); }
  },
  clipImage: async ({ dataUrl }) => {
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/.test(dataUrl) || dataUrl.length > 80 * 1024 * 1024) throw new Error('Not an image');
    const img = electron.nativeImage.createFromDataURL(dataUrl); if (img.isEmpty()) throw new Error('The image could not be read');
    electron.clipboard.writeImage(img); return true;
  },
  qrMake: async ({ text }) => {
    if (typeof text !== 'string' || !text || text.length > 1000) throw new Error('Type something of up to 1000 characters');
    return require('qrcode').toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  }
});
/* ---------- Rename (bulk renamer) and Pix batch saving ---------- */
const renameOk = new Set();
const BAD_NAME = /[<>:"/\\|?*\u0000-\u001f]|^\.{1,2}$|[. ]$|^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const sameDirTarget = (from, to) => path.join(path.dirname(from), to);
Object.assign(handlers, {
  renamePick: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return [];
    return r.filePaths.slice(0, 2000).filter((f) => fs.statSync(f).isFile()).map((f) => { renameOk.add(path.resolve(f)); return { path: f, name: path.basename(f) }; });
  },
  renameApply: async ({ items }) => {
    if (!Array.isArray(items) || !items.length || items.length > 2000) throw new Error('Nothing to rename');
    const plan = items.map((i) => ({ from: path.resolve(String(i.from)), to: String(i.to) }));
    const targets = new Set();
    for (const p of plan) {
      if (!renameOk.has(p.from)) throw new Error('Only files you picked in Rename can be renamed');
      if (!p.to || p.to.length > 200 || BAD_NAME.test(p.to)) throw new Error(`"${p.to}" is not a valid file name`);
      const dest = path.resolve(sameDirTarget(p.from, p.to)); const key = isWin ? dest.toLowerCase() : dest;
      if (targets.has(key)) throw new Error(`Two files would both be called "${p.to}"`); targets.add(key);
      if (!fs.existsSync(p.from)) throw new Error(`"${path.basename(p.from)}" no longer exists`);
      if (dest !== p.from && fs.existsSync(dest) && !plan.some((q) => q.from === dest)) throw new Error(`"${p.to}" already exists in that folder`);
    }
    const done = []; const stage = [];
    try { // two steps through temporary names, so swapping names (a->b, b->a) can never overwrite anything
      for (const p of plan) { const dest = path.resolve(sameDirTarget(p.from, p.to)); if (dest === p.from) continue; const tmp = p.from + '.aurora-tmp-' + Math.random().toString(36).slice(2, 8); fs.renameSync(p.from, tmp); stage.push({ p, tmp, dest }); }
      for (const s of stage) { fs.renameSync(s.tmp, s.dest); done.push({ from: s.p.from, to: s.dest }); renameOk.add(s.dest); }
    } catch (e) { for (const s of stage) { try { if (fs.existsSync(s.tmp)) fs.renameSync(s.tmp, s.p.from); else if (fs.existsSync(s.dest)) fs.renameSync(s.dest, s.p.from); } catch (_) {} } throw new Error('Rename stopped and was undone: ' + e.message); }
    return { done: done.map((d) => ({ from: d.from, to: d.to, name: path.basename(d.to) })) };
  },
  saveBatch: async ({ files }) => {
    if (!Array.isArray(files) || !files.length || files.length > 500) throw new Error('Nothing to save');
    const r = await dialog.showOpenDialog({ title: 'Choose a folder to save into', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = r.filePaths[0]; let n = 0; let total = 0;
    for (const f of files) {
      const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(f.dataUrl)); if (!m) continue;
      const buf = Buffer.from(m[2], 'base64'); total += buf.length; if (total > 1024 * 1024 * 1024) throw new Error('Too much data to save at once');
      let name = path.basename(String(f.name)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 150) || 'image'; if (BAD_NAME.test(name)) name = '_' + name;
      let out = path.join(dir, name), k = 1; const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
      while (fs.existsSync(out)) out = path.join(dir, `${stem}-${k++}${ext}`); // never overwrite
      fs.writeFileSync(out, buf); n++;
    }
    return { saved: n, dir };
  }
});
/* ---------- Vorynth Store (see lib/appstore.js) ---------- */
const appStore = require('./lib/appstore').createAppStore({
  source: require('./lib/appstore').githubSource({ token: process.env.AURORA_GITHUB_TOKEN || '' }),
  dataDir: path.join(app.getPath('userData'), 'store'),
  appsDir: path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Aurora', 'Apps'),
  runner: require('./lib/appstore-win').createWinRunner({
    ps, shell,
    startMenuDir: path.join(process.env.APPDATA || app.getPath('userData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Aurora Apps')
  })
});
Object.assign(handlers, {
  appStoreCatalog: () => appStore.listApps(),
  appStoreInstall: ({ id }) => appStore.install(String(id)),
  appStoreUninstall: ({ id }) => appStore.uninstall(String(id)),
  appStoreJobs: () => appStore.jobs(),
  appStoreCancel: ({ jobId }) => appStore.cancel(String(jobId)),
  appStoreAdd: ({ id }) => appStore.add(id),
  appStoreRemove: ({ id }) => appStore.removeCustom(String(id)),
  appStoreInfo: ({ id }) => appStore.info(String(id)),
  appStoreUpdates: () => appStore.updates({ force: true }),
  appStoreUpdatesReport: () => appStore.updatesReport({ force: true }),
  appStoreHomepage: async ({ id }) => { const i = await appStore.info(String(id)); if (!/^https:\/\//.test(i.homepage)) throw new Error('No website listed'); await shell.openExternal(i.homepage); return true; }
});
/* ---------- Vorynth self-update and automatic update detection (see lib/selfupdate.js) ---------- */
const updCfgFile = path.join(app.getPath('userData'), 'update-settings.json');
const updCfg = (() => { try { const j = JSON.parse(fs.readFileSync(updCfgFile, 'utf8')); return { url: typeof j.url === 'string' && /^https:\/\//i.test(j.url) ? j.url.slice(0, 500) : '', auto: j.auto !== false }; } catch (_) { return { url: '', auto: true }; } })();
const saveUpdCfg = () => { try { fs.writeFileSync(updCfgFile, JSON.stringify(updCfg)); } catch (_) {} };
const selfUpd = require('./lib/selfupdate').createSelfUpdater({
  exePath: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, isPortable: !!process.env.PORTABLE_EXECUTABLE_FILE, currentVersion: app.getVersion(), currentBuild: ((() => { const t = require('./lib/buildstamp').readStamp(process.env.PORTABLE_EXECUTABLE_FILE || process.execPath); return t && t.version === app.getVersion() ? t.build : 0; })()),
  dataDir: path.join(app.getPath('userData'), 'store'), getUrl: () => updCfg.url, quitApp: () => { quitting = true; app.quit(); }
});
const detected = { online: null, file: null, apps: [], lastCheck: 0, notified: new Set() };
const downloadsDir = () => { try { return app.getPath('downloads'); } catch (_) { return ''; } };
async function detectUpdates({ quiet } = {}) {
  const out = { online: null, file: null, apps: [], errors: [] };
  if (updCfg.url) { try { const r = await selfUpd.check(); if (r.available) out.online = { version: r.latest, notes: r.notes }; } catch (e) { out.errors.push(e.message); } }
  const f = downloadsDir() ? selfUpd.scanFolder(downloadsDir()) : null; if (f) out.file = f;
  try { const rep = await appStore.updatesReport({ aurora: true }); out.apps = rep.updates; if (rep.limited && !rep.updates.length) out.errors.push(rep.limited); } catch (e) { out.errors.push(e.message); }
  Object.assign(detected, out, { lastCheck: Date.now() });
  const say = (key, text) => { if (!detected.notified.has(key)) { detected.notified.add(key); integration.notify(text); } };
  if (out.online) say('o' + out.online.version, `Vorynth ${out.online.version} is available. Open Vorynth to update.`);
  if (out.file) say('f' + out.file.path + out.file.builtAt, `A newer Vorynth file was found in Downloads (${out.file.name}). Open Vorynth to update.`);
  if (out.apps.length) say('a' + out.apps.map((a) => a.id + a.latest).join(), `${out.apps.length} app update${out.apps.length === 1 ? '' : 's'} available in Vorynth Store.`);
  void quiet; return out;
}
let updTimer = null, updWatch = null, updDebounce = null;
const startAutoDetect = () => { if (updTimer) return;
  try { const dir = downloadsDir(); if (dir && fs.existsSync(dir)) { updWatch = fs.watch(dir, () => { clearTimeout(updDebounce); updDebounce = setTimeout(() => { if (updCfg.auto) detectUpdates({ quiet: true }).catch(() => {}); }, 4000); }); updWatch.on('error', () => {}); } } catch (_) { /* watching is a bonus; the timer still checks */ } setTimeout(() => { if (updCfg.auto) detectUpdates().catch(() => {}); }, 25000); updTimer = setInterval(() => { if (updCfg.auto) detectUpdates().catch(() => {}); }, 6 * 3600 * 1000); updTimer.unref && updTimer.unref(); };
const updPicked = new Set();
Object.assign(handlers, {
  updateInfo: async () => ({ ...selfUpd.info(), auto: updCfg.auto, detected: { online: detected.online, file: detected.file, apps: detected.apps, lastCheck: detected.lastCheck } }),
  updateSettings: async ({ url, auto }) => {
    if (typeof url === 'string') { const u = url.trim(); if (u && !/^https:\/\/[^\s]+$/i.test(u)) throw new Error('The update address must start with https://'); updCfg.url = u.slice(0, 500); }
    if (typeof auto === 'boolean') updCfg.auto = auto; saveUpdCfg(); return { url: updCfg.url, auto: updCfg.auto };
  },
  updateCheck: async () => { const r = await detectUpdates(); return { online: r.online, file: r.file, apps: r.apps, errors: r.errors, status: selfUpd.info().status }; },
  updateStatus: async () => ({ online: detected.online, file: detected.file, apps: detected.apps.length, state: selfUpd.info().status.state }),
  updateDownload: async () => selfUpd.download(),
  updatePickFile: async () => { const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Vorynth Settings program', extensions: ['exe'] }] }); if (r.canceled || !r.filePaths[0]) return null; return selfUpd.useFile(r.filePaths[0]); },
  updateUseFound: async () => { if (!detected.file) throw new Error('No downloaded update was found'); return selfUpd.useFile(detected.file.path); },
  updateApply: async () => selfUpd.apply(),
  updateDiscard: async () => selfUpd.discard()
});
void updPicked;
/* ---------- Window conveniences: stay on top, zoom ---------- */
Object.assign(handlers, {
  windowPin: async ({ on }) => { if (!mainWin || mainWin.isDestroyed()) throw new Error('No window'); mainWin.setAlwaysOnTop(!!on, 'floating'); return mainWin.isAlwaysOnTop(); },
  windowZoom: async ({ factor }) => { const f = Number(factor); if (!Number.isFinite(f) || f < 0.6 || f > 1.8) throw new Error('Zoom must be between 60% and 180%'); if (!mainWin || mainWin.isDestroyed()) throw new Error('No window'); mainWin.webContents.setZoomFactor(Math.round(f * 100) / 100); return mainWin.webContents.getZoomFactor(); }
});
/* ---------- Vorynth Toolkit: network checks, Drop, disk speed, PDF and ZIP tools (see lib/toolkit.js) ---------- */
const tk = require('./lib/toolkit');
const drop = tk.createDrop(); const tkOk = new Set();
const btAudio = require('./lib/btaudio').createBtAudio({ ps });
const approved = (p) => { const f = path.resolve(String(p)); if (!tkOk.has(f)) throw new Error('Only files you picked in the tool can be used'); if (!fs.existsSync(f)) throw new Error(`"${path.basename(f)}" no longer exists`); return f; };
const uniqueIn = (dir, name) => { const ext = path.extname(name), stem = name.slice(0, name.length - ext.length); let out = path.join(dir, name), k = 1; while (fs.existsSync(out)) out = path.join(dir, `${stem}-${k++}${ext}`); return out; };
Object.assign(handlers, {
  netDns: async (a) => tk.netDns(a), netPort: async (a) => tk.netPort(a), netSsl: async (a) => tk.netSsl(a), netHeaders: async (a) => tk.netHeaders(a), netPublicIp: async () => tk.netPublicIp(), netWol: async (a) => tk.netWol({ mac: a.mac }),
  dropStart: async ({ once, encrypt }) => { const r = await dialog.showOpenDialog({ title: 'Choose a file to share', properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; return drop.start({ file: r.filePaths[0], once: once !== false, encrypt: encrypt !== false }); },
  dropStop: async () => drop.stop(), dropStatus: async () => drop.status(),
  // Bluetooth audio and LDAC (lib/btaudio.js). Switching codecs works on Linux; on Windows the page explains the limits and lists devices.
  btAudioInfo: async () => btAudio.info(),
  btAudioSetProfile: async ({ card, profile }) => btAudio.setProfile(String(card || ''), String(profile || '')),
  btAudioOpenSettings: async ({ which }) => { if (process.platform !== 'win32') throw new Error('Windows only'); await shell.openExternal(which === 'sound' ? 'ms-settings:sound' : 'ms-settings:bluetooth'); return true; },
  // Password-lock any file (lib/e2ee.js: scrypt + ChaCha20-Poly1305). The result is written next to the original; the original is never touched.
  fileLockEncrypt: async ({ password }) => {
    const e2ee = require('./lib/e2ee'); const r = await dialog.showOpenDialog({ title: 'Choose a file to lock', properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0]; const s = await dialog.showSaveDialog({ title: 'Save the locked file', defaultPath: src + '.aur', filters: [{ name: 'Vorynth locked file', extensions: ['aur'] }] }); if (s.canceled || !s.filePath) return null;
    if (path.resolve(s.filePath) === path.resolve(src)) throw new Error('Choose a different name for the locked copy');
    const tmpOut = s.filePath + '.' + require('crypto').randomBytes(4).toString('hex') + '.tmp';
    try { const res = await e2ee.encryptFileWithPassword(src, tmpOut, String(password || '')); fs.renameSync(tmpOut, s.filePath); return { out: s.filePath, bytes: res.bytes }; } catch (e) { try { fs.rmSync(tmpOut, { force: true }); } catch (_) {} throw e; }
  },
  fileLockDecrypt: async ({ password }) => {
    const e2ee = require('./lib/e2ee'); const r = await dialog.showOpenDialog({ title: 'Choose a locked file', properties: ['openFile'], filters: [{ name: 'Vorynth locked file', extensions: ['aur'] }, { name: 'All files', extensions: ['*'] }] }); if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0]; const s = await dialog.showSaveDialog({ title: 'Save the unlocked file', defaultPath: /\.aur$/i.test(src) ? src.replace(/\.aur$/i, '') : src + '.unlocked' }); if (s.canceled || !s.filePath) return null;
    if (path.resolve(s.filePath) === path.resolve(src)) throw new Error('Choose a different name for the unlocked copy');
    const tmpOut = s.filePath + '.' + require('crypto').randomBytes(4).toString('hex') + '.tmp';
    try { const res = await e2ee.decryptFileWithPassword(src, tmpOut, String(password || '')); fs.renameSync(tmpOut, s.filePath); return { out: s.filePath, bytes: res.bytes }; } catch (e) { try { fs.rmSync(tmpOut, { force: true }); } catch (_) {} throw e; }
  },
  diskSpeed: async (a) => tk.diskSpeed({ sizeMB: a.sizeMB }),
  gpuMon: async (a) => require('./lib/gpumon').collect(),
  pcRate: async (a) => { const rating = require('./lib/rating'); const names = await gpuNames(); const best = names.map((n) => [n, rating.graphics(n).score || 0]).sort((x, y) => y[1] - x[1])[0]; const r = await rating.run({ quick: !!(a && a.quick), gpu: best ? best[0] : '' }); r.gpus = names; return r; },
  pdfPick: async ({ multi }) => {
    const r = await dialog.showOpenDialog({ properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled) return [];
    const out = []; for (const f of r.filePaths.slice(0, 100)) { tkOk.add(path.resolve(f)); try { const i = await tk.pdfInfo(f); out.push({ path: f, name: path.basename(f), pages: i.pages, size: i.size }); } catch (e) { out.push({ path: f, name: path.basename(f), error: e.message }); } } return out;
  },
  pdfMerge: async ({ paths }) => { if (!Array.isArray(paths)) throw new Error('Pick PDFs first'); const files = paths.map(approved); const buf = await tk.pdfMerge(files); const r = await dialog.showSaveDialog({ defaultPath: 'merged.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, buf); return { path: r.filePath, bytes: buf.length }; },
  pdfExtract: async ({ path: p, pages }) => { const f = approved(p); const buf = await tk.pdfExtract(f, pages); const r = await dialog.showSaveDialog({ defaultPath: path.basename(f).replace(/\.pdf$/i, '') + '-pages.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, buf); return { path: r.filePath, bytes: buf.length }; },
  pdfRotate: async ({ path: p, degrees, pages }) => { const f = approved(p); const buf = await tk.pdfRotate(f, degrees, pages); const r = await dialog.showSaveDialog({ defaultPath: path.basename(f).replace(/\.pdf$/i, '') + '-rotated.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, buf); return { path: r.filePath, bytes: buf.length }; },
  pdfSplitAll: async ({ path: p }) => { const f = approved(p); const parts = await tk.pdfSplitAll(f); const r = await dialog.showOpenDialog({ title: 'Choose a folder for the pages', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; const base = path.basename(f).replace(/\.pdf$/i, ''); parts.forEach((b, i) => fs.writeFileSync(uniqueIn(r.filePaths[0], `${base}-page-${i + 1}.pdf`), b)); return { files: parts.length, dir: r.filePaths[0] }; },
  zipPick: async ({ folder }) => { const r = await dialog.showOpenDialog({ properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'] }); if (r.canceled) return []; return r.filePaths.slice(0, 500).map((f) => { tkOk.add(path.resolve(f)); return { path: f, name: path.basename(f), dir: fs.statSync(f).isDirectory() }; }); },
  zipMake: async ({ paths }) => { if (!Array.isArray(paths) || !paths.length) throw new Error('Pick files first'); const files = paths.map(approved); const r = await dialog.showSaveDialog({ defaultPath: 'archive.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] }); if (r.canceled || !r.filePath) return null; const o = tk.zipCreate(files, r.filePath); return { path: r.filePath, ...o }; },
  zipOpen: async () => { const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'ZIP', extensions: ['zip'] }] }); if (r.canceled || !r.filePaths[0]) return null; const f = r.filePaths[0]; tkOk.add(path.resolve(f)); return { path: f, name: path.basename(f), ...tk.zipList(f) }; },
  zipUnpack: async ({ path: p }) => { const f = approved(p); const r = await dialog.showOpenDialog({ title: 'Unpack into which folder?', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; const dest = path.join(r.filePaths[0], path.basename(f).replace(/\.zip$/i, '') || 'unpacked'); return tk.zipExtract(f, dest); }
});
/* ---------- Add-ons (see lib/addons.js) ---------- */
const addonLib = require('./lib/addons');
const addonsDir = path.join(app.getPath('userData'), 'addons'); const addonData = path.join(app.getPath('userData'), 'addon-data');
const addonInstaller = addonLib.createInstaller(addonsDir); const staged = new Map();
const stageClean = () => { for (const [k, v] of staged) if (Date.now() - v.t > 10 * 60000) staged.delete(k); };
const addonRec = (id) => integration.store.get().addons.find((a) => a.id === id);
const needPerm = (id, perm) => { const a = addonRec(id); if (!a || !a.enabled) throw new Error('That add-on is not installed or is turned off'); if (!a.permissions.includes(perm)) throw new Error('This add-on did not ask for that permission'); return a; };
const stagedInfo = (token, pkg) => ({ token, manifest: pkg.manifest, permissions: pkg.manifest.permissions.map((k) => ({ key: k, label: addonLib.PERMISSIONS[k] })), files: [...pkg.files.keys()].slice(0, 50), bytes: pkg.bytes, replacing: !!addonRec(pkg.manifest.id) });
const stagePkg = (pkg) => { stageClean(); const token = require('crypto').randomBytes(12).toString('hex'); staged.set(token, { pkg, t: Date.now() }); return stagedInfo(token, pkg); };
const addonFail = (e) => { throw (e instanceof addonLib.AddonError ? new Error(e.message) : e); };
const readData = (id) => { try { const j = JSON.parse(fs.readFileSync(path.join(addonData, id + '.json'), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (_) { return {}; } };
const writeData = (id, o) => { fs.mkdirSync(addonData, { recursive: true }); fs.writeFileSync(path.join(addonData, id + '.json'), JSON.stringify(o)); };
let lastAddonNote = 0;
Object.assign(handlers, {
  addonList: async () => integration.store.get().addons.map((a) => ({ ...a, permissionLabels: a.permissions.map((k) => addonLib.PERMISSIONS[k]) })),
  addonStage: async (a) => {
    try {
      if (a.kind === 'file') { const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Vorynth add-on', extensions: ['zip', 'aurora-addon'] }] }); if (r.canceled || !r.filePaths[0]) return null; return stagePkg(addonLib.checkPackage(addonLib.readZip(r.filePaths[0]))); }
      if (a.kind === 'sample') { if (!Object.prototype.hasOwnProperty.call(addonLib.SAMPLES, a.name)) throw new Error('Unknown sample'); return stagePkg(addonLib.checkPackage(addonLib.SAMPLES[a.name]())); }
      if (a.kind === 'create') {
        const studio = typeof a.js === 'string' || typeof a.css === 'string'; const m = { id: a.id, name: a.name, version: String(a.version || '1.0.0'), icon: a.icon, description: a.description || '', author: a.author || '', permissions: a.permissions || [] }; addonLib.validateManifest(m);
        if (typeof a.html !== 'string' || a.html.length > 500000 || !a.html.trim()) throw new Error('Write some HTML for the add-on first'); if ((a.js || '').length > 500000 || (a.css || '').length > 200000) throw new Error('That code is too long');
        if (!studio) return stagePkg(addonLib.checkPackage(new Map([['manifest.json', Buffer.from(JSON.stringify(m))], ['index.html', Buffer.from(a.html)], ['style.css', Buffer.from(addonLib.BASE_CSS)]])));
        const body = a.html; const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"><script src="/__aurora.js"></script></head><body>\n${body}\n<script src="app.js"></script></body></html>`;
        return stagePkg(addonLib.checkPackage(new Map([['manifest.json', Buffer.from(JSON.stringify(m, null, 2))], ['index.html', Buffer.from(page)], ['style.css', Buffer.from(addonLib.BASE_CSS + '\n/* your styles */\n' + (a.css || ''))], ['app.js', Buffer.from(a.js || '')]])));
      }
      throw new Error('Unknown add-on source');
    } catch (e) { addonFail(e); }
  },
  addonInstall: async ({ token }) => {
    stageClean(); const s = staged.get(String(token)); if (!s) throw new Error('That install request expired. Choose the add-on again.');
    const cur = integration.store.get().addons; if (!addonRec(s.pkg.manifest.id) && cur.length >= addonLib.LIMITS.installed) throw new Error('You already have 50 add-ons. Remove one first.');
    try { addonInstaller.install(s.pkg); } catch (e) { addonFail(e); } staged.delete(String(token));
    integration.store.set('addons', [...cur.filter((x) => x.id !== s.pkg.manifest.id), { ...s.pkg.manifest, enabled: true, installedAt: Date.now() }]); return addonRec(s.pkg.manifest.id);
  },
  addonDiscard: async ({ token }) => staged.delete(String(token)),
  addonSetEnabled: async ({ id, enabled }) => { if (!addonRec(String(id))) throw new Error('Unknown add-on'); integration.store.set('addons', integration.store.get().addons.map((x) => (x.id === id ? { ...x, enabled: !!enabled } : x))); return true; },
  addonRemove: async ({ id }) => { id = String(id); if (!addonRec(id)) throw new Error('Unknown add-on'); addonInstaller.remove(id); try { fs.rmSync(path.join(addonData, id + '.json'), { force: true }); } catch (_) {} integration.store.set('addons', integration.store.get().addons.filter((x) => x.id !== id)); return true; },
  addonRead: async ({ id }) => {
    if (!addonLib.ID_RE.test(String(id))) throw new Error('Unknown add-on'); const rd = (f) => { const r = addonInstaller.readFile(id, f); return r ? r.data.toString('utf8') : null; }; const mf = rd('manifest.json'); if (!mf) throw new Error('That add-on is not installed'); const manifest = JSON.parse(mf); const idx = rd('index.html') || ''; const js = rd('app.js'); const css = rd('style.css') || '';
    const studio = js !== null && /<script src="app\.js"><\/script>/.test(idx); if (!studio) return { manifest, studio: false, html: idx, css: '', js: '' };
    const bm = /<body>\n?([\s\S]*?)\n?<script src="app\.js"><\/script><\/body>/.exec(idx); const mark = css.indexOf('/* your styles */'); return { manifest, studio: true, html: bm ? bm[1] : idx, css: mark >= 0 ? css.slice(mark + '/* your styles */'.length).replace(/^\n/, '') : '', js };
  },
  addonExport: async ({ id }) => {
    id = String(id); const a = addonRec(id); if (!a) throw new Error('Unknown add-on'); const files = new Map(); const root = path.join(addonsDir, id);
    const walk = (d, base) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const st = fs.lstatSync(f); if (st.isSymbolicLink()) continue; if (st.isDirectory()) walk(f, base + n + '/'); else files.set(base + n, fs.readFileSync(f)); } }; walk(root, '');
    const r = await dialog.showSaveDialog({ defaultPath: id + '.aurora-addon', filters: [{ name: 'Vorynth add-on', extensions: ['aurora-addon', 'zip'] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, addonLib.packageToZip(files)); return r.filePath;
  },
  addonStorage: async ({ id, op, key, value }) => {
    needPerm(String(id), 'storage'); const data = readData(id);
    if (op === 'keys') return Object.keys(data);
    if (typeof key !== 'string' || !key || key.length > 60) throw new Error('A storage key is a short piece of text');
    if (op === 'get') return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    if (op === 'remove') { delete data[key]; writeData(id, data); return true; }
    if (op === 'set') { const j = JSON.stringify(value === undefined ? null : value); if (j.length > 20000) throw new Error('That value is too big (20 KB limit)'); if (!Object.prototype.hasOwnProperty.call(data, key) && Object.keys(data).length >= 200) throw new Error('Too many saved items (200 limit)'); data[key] = JSON.parse(j); if (JSON.stringify(data).length > 100000) throw new Error('This add-on has used up its 100 KB of storage'); writeData(id, data); return true; }
    throw new Error('Unknown storage action');
  },
  addonClipboard: async ({ id, text }) => { needPerm(String(id), 'clipboard'); if (typeof text !== 'string' || text.length > 100000) throw new Error('Nothing to copy'); electron.clipboard.writeText(text); return true; },
  addonNotify: async ({ id, text }) => { const a = needPerm(String(id), 'notify'); if (typeof text !== 'string' || !text.trim()) throw new Error('Nothing to show'); if (Date.now() - lastAddonNote < 4000) throw new Error('Notifications are limited to one every few seconds'); lastAddonNote = Date.now(); integration.notify(`${a.name}: ${text.slice(0, 120)}`); return true; }
});
/* ---------- Screen permission for add-ons: tint, dim, spotlight, crosshair, brightness, warmth ---------- */
const screenWins = new Map(); // addon id -> { wins: [], timer }
const SCREEN_MODES = ['tint', 'vignette', 'spotlight', 'crosshair', 'focusline', 'grid'];
const screenHex = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);
const screenNum = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function screenClear(id) {
  const s = screenWins.get(id); if (!s) return; screenWins.delete(id); clearInterval(s.timer);
  for (const w of s.wins) { try { if (!w.isDestroyed()) w.destroy(); } catch (_) {} }
}
const screenClearAll = () => { for (const id of [...screenWins.keys()]) screenClear(id); };
function screenPage(cfg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}#o{position:fixed;inset:0}</style></head><body><div id="o"></div><script>
var C=${JSON.stringify(cfg)},o=document.getElementById('o');
function rgba(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'}
window.__c=function(x,y){var m=C.mode,c=rgba(C.color,C.opacity);
 if(m==='tint'){o.style.background=c}
 else if(m==='vignette'){o.style.background='radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, '+c+' 100%)'}
 else if(m==='spotlight'){o.style.background='radial-gradient(circle '+C.size+'px at '+x+'px '+y+'px, rgba(0,0,0,0) 0, rgba(0,0,0,0) '+(C.size*0.7)+'px, '+c+' '+C.size+'px)'}
 else if(m==='focusline'){var h=C.size/2;o.style.background='linear-gradient(to bottom,'+c+' 0,'+c+' '+(y-h)+'px,rgba(0,0,0,0) '+(y-h)+'px,rgba(0,0,0,0) '+(y+h)+'px,'+c+' '+(y+h)+'px,'+c+' 100%)'}
 else if(m==='crosshair'){var t=C.thickness;o.style.background='linear-gradient('+c+','+c+') 0 '+(y-t/2)+'px/100% '+t+'px no-repeat, linear-gradient('+c+','+c+') '+(x-t/2)+'px 0/'+t+'px 100% no-repeat'}
 else if(m==='grid'){var g=C.size;o.style.background='linear-gradient(to right,'+c+' 1px,transparent 1px) 0 0/'+g+'px '+g+'px, linear-gradient(to bottom,'+c+' 1px,transparent 1px) 0 0/'+g+'px '+g+'px'}};
window.__c(-9999,-9999);
</script></body></html>`;
}
function screenOverlay(id, o) {
  o = o && typeof o === 'object' ? o : {};
  const mode = SCREEN_MODES.includes(o.mode) ? o.mode : 'tint';
  const maxOp = mode === 'tint' ? 0.8 : 0.9;
  const cfg = { mode, color: screenHex(o.color, mode === 'crosshair' || mode === 'grid' ? '#ff3b3b' : '#000000'), opacity: screenNum(o.opacity, 0.02, maxOp, 0.3), size: screenNum(o.size, mode === 'grid' ? 20 : 40, mode === 'grid' ? 400 : 800, mode === 'focusline' ? 90 : 260), thickness: screenNum(o.thickness, 1, 8, 2) };
  screenClear(id);
  const wins = [];
  for (const d of electron.screen.getAllDisplays()) {
    const w = new electron.BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, transparent: true, frame: false, skipTaskbar: true, focusable: false, hasShadow: false, resizable: false, movable: false, show: false, fullscreenable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    w.setIgnoreMouseEvents(true); w.setAlwaysOnTop(true, 'screen-saver'); try { w.setVisibleOnAllWorkspaces(true); } catch (_) {}
    w.webContents.once('did-finish-load', () => { if (!w.isDestroyed()) w.showInactive(); });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(screenPage(cfg))).then(() => { if (!w.isDestroyed()) w.showInactive(); }).catch(logError);
    wins.push({ w, d });
  }
  const live = ['spotlight', 'crosshair', 'focusline'].includes(mode);
  const timer = live ? setInterval(() => {
    const p = electron.screen.getCursorScreenPoint();
    for (const { w, d } of wins) if (!w.isDestroyed()) w.webContents.executeJavaScript(`window.__c(${Math.round(p.x - d.bounds.x)},${Math.round(p.y - d.bounds.y)})`).catch(() => {});
  }, 33) : null;
  screenWins.set(id, { wins: wins.map((x) => x.w), timer });
  return true;
}
const kelvinRgb = (k) => { k = screenNum(k, 1500, 6500, 6500) / 100; const r = 1; const g = k <= 66 ? Math.min(1, Math.max(0, (99.47 * Math.log(k) - 161.12) / 255)) : 1; const b = k >= 66 ? 1 : k <= 19 ? 0 : Math.min(1, Math.max(0, (138.52 * Math.log(k - 10) - 305.04) / 255)); return [r, g, b]; };
const xrandrOutputs = () => new Promise((ok) => execFile('xrandr', ['--query'], { timeout: 5000, encoding: 'utf8' }, (e, o) => ok(e ? [] : [...o.matchAll(/^(\S+) connected/gm)].map((m) => m[1]))));
const xrandrRun = (args) => new Promise((ok, no) => execFile('xrandr', args, { timeout: 5000 }, (e) => (e ? no(new Error('The display did not accept that')) : ok())));
const screenLinuxState = { b: 1, k: 6500 };
async function screenLinuxApply() { const g = kelvinRgb(screenLinuxState.k); for (const out of await xrandrOutputs()) await xrandrRun(['--output', out, '--brightness', String(screenLinuxState.b), '--gamma', g.map((x) => x.toFixed(3)).join(':')]); }
Object.assign(handlers, {
  addonScreen: async ({ id, op, value }) => {
    needPerm(String(id), 'screen'); id = String(id);
    if (op === 'overlay') return screenOverlay(id, value);
    if (op === 'clear') { screenClear(id); return true; }
    if (op === 'brightness.get') {
      if (process.platform === 'win32') return Number(await handlers.brightnessGet());
      if (process.platform === 'linux') return Math.round(screenLinuxState.b * 100);
      throw new Error('Brightness is not available on this system');
    }
    if (op === 'brightness.set') {
      const v = Math.round(screenNum(value, 10, 100, 100));
      if (process.platform === 'win32') { await handlers.brightnessSet({ value: v }); return true; }
      if (process.platform === 'linux') { screenLinuxState.b = v / 100; await screenLinuxApply(); return true; }
      throw new Error('Brightness is not available on this system');
    }
    if (op === 'warmth') {
      if (process.platform !== 'linux') throw new Error('Warmth works on Vorynth OS. On Windows use overlay with an orange colour.');
      screenLinuxState.k = Math.round(screenNum(value, 1500, 6500, 6500)); await screenLinuxApply(); return true;
    }
    if (op === 'reset') { screenClear(id); if (process.platform === 'linux') { screenLinuxState.b = 1; screenLinuxState.k = 6500; await screenLinuxApply(); } return true; }
    throw new Error('Unknown screen action');
  }
});
app.on('will-quit', screenClearAll);
app.whenReady().then(() => { try { electron.globalShortcut.register('CommandOrControl+Alt+Shift+O', screenClearAll); } catch (e) { logError(e); } });
app.whenReady().then(() => {
  try {
    if (electron.protocol && electron.protocol.handle) electron.protocol.handle('aurora-addon', (req) => {
      let u; try { u = new URL(req.url); } catch (_) { return new Response('Bad request', { status: 400 }); }
      const id = u.hostname; const a = addonRec(id); if (!a || !a.enabled) return new Response('Not found', { status: 404 });
      const headers = { 'content-security-policy': addonLib.CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-origin' };
      let rel; try { rel = decodeURIComponent(u.pathname.replace(/^\//, '')); } catch (_) { return new Response('Bad request', { status: 400 }); }
      if (rel === '__aurora.js') return new Response(addonLib.SDK, { status: 200, headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
      const f = addonInstaller.readFile(id, rel === '' ? a.entry : rel); if (!f) return new Response('Not found', { status: 404, headers });
      return new Response(f.data, { status: 200, headers: { ...headers, 'content-type': f.type } });
    });
  } catch (_) { /* protocol is not available outside Electron */ }
}).catch(() => {});
/* ---------- Space Finder: read-only disk usage and duplicate report (see lib/space.js) ---------- */
const space = require('./lib/space'); const spaceOk = new Set();
Object.assign(handlers, {
  spacePick: async () => { const r = await dialog.showOpenDialog({ title: 'Choose a folder to check', properties: ['openDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; return r.filePaths[0]; },
  spaceScan: async ({ root }) => { const res = space.scan(String(root || '')); spaceOk.clear(); for (const f of res.biggest) spaceOk.add(path.resolve(f.path)); for (const f of res.folders) spaceOk.add(path.resolve(f.path)); for (const g of res.duplicates) for (const p of g.paths) spaceOk.add(path.resolve(p)); return res; },
  spaceReveal: async ({ path: p }) => { const r = path.resolve(String(p || '')); if (!spaceOk.has(r)) throw new Error('Scan a folder first, then pick an item from the list'); shell.showItemInFolder(r); return true; }
});
/* ---------- Linux support ---------- */
const linuxSysinfo = async () => {
  const cpus = os.cpus(); const gpu = '';
  let name = process.platform === 'darwin' ? 'macOS ' + os.release() : 'Linux'; try { name = (fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)/m) || [])[1] || name; } catch (_) { /* ignore */ }
  return { device: os.hostname(), os: name, build: '', version: os.release(), arch: os.arch(), cpu: (cpus[0] && cpus[0].model || '').trim(), cores: Math.max(1, Math.round(cpus.length / 2)), threads: cpus.length, gpu, ramGB: Math.round(os.totalmem() / 1073741824), maker: '', model: '', bios: '' };
};
Object.assign(handlers, {
  appVersion: async () => app.getVersion(),
  platformInfo: async () => ({ platform: process.platform, release: os.release() }),
});
/* ---------- File joiner (see lib/joiner.js) ---------- */
const joiner = require('./lib/joiner'); const joinOk = new Set(); let joinLast = '';
Object.assign(handlers, {
  joinPick: async () => {
    const r = await dialog.showOpenDialog({ title: 'Choose ALL the parts, and the .sha256 file if you have it (Ctrl+A selects everything)', properties: ['openFile', 'multiSelections'] }); if (r.canceled || !r.filePaths.length) return null; joinOk.clear();
    const sumsFile = r.filePaths.find((p) => /\.sha256$/i.test(p)); const list = r.filePaths.filter((p) => !/\.sha256$/i.test(p)).slice(0, 2000).sort((a, b) => joiner.natural(path.basename(a), path.basename(b)));
    if (!list.length) throw new Error('No parts were chosen'); for (const p of list) joinOk.add(path.resolve(p));
    let check = null; if (sumsFile) { const st = fs.statSync(sumsFile); if (st.size > 200000) throw new Error('That .sha256 file is too big'); check = joiner.verifyParts(list, joiner.parseSums(fs.readFileSync(sumsFile, 'utf8'))); }
    return { parts: list.map((p) => ({ name: path.basename(p), size: fs.statSync(p).size })), suggest: joiner.suggestName(list[0]), check };
  },
  joinRun: async ({ name }) => {
    if (!joinOk.size) throw new Error('Choose the parts first'); const parts = [...joinOk]; const dir = path.dirname(parts[0]);
    const r = await dialog.showSaveDialog({ title: 'Save the joined file as', defaultPath: path.join(dir, String(name || joiner.suggestName(parts[0]))) }); if (r.canceled || !r.filePath) return null;
    const res = await heavy.run('join', { parts, out: r.filePath }); joinLast = res.path; return res;
  },
  joinReveal: async () => { if (!joinLast || !fs.existsSync(joinLast)) throw new Error('Nothing joined yet'); shell.showItemInFolder(joinLast); return true; }
});
/* ---------- Add-on library: names and descriptions of the add-ons that ship inside Vorynth (installed one at a time, on request) ---------- */
Object.assign(handlers, { addonLibrary: async () => { const out = []; for (const key of Object.keys(addonLib.SAMPLES)) { try { const mf = addonLib.checkPackage(addonLib.SAMPLES[key]()).manifest; out.push({ key, id: mf.id, name: mf.name, icon: mf.icon, description: mf.description, permissions: mf.permissions }); } catch (_) { /* skip a broken one */ } } return out; } });
/* ---------- Vorynth Utilities: hash check, folder compare, empty folders (see lib/utils.js). All read-only. ---------- */
const utils = require('./lib/utils'); const utilsOk = new Set(); const utilsPick = { file: '', a: '', b: '' };
const pickDir = async (title) => { const r = await dialog.showOpenDialog({ title, properties: ['openDirectory'] }); return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]; };
Object.assign(handlers, {
  utilsPickFile: async () => { const r = await dialog.showOpenDialog({ title: 'Choose a file to check', properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; utilsPick.file = r.filePaths[0]; return { path: r.filePaths[0], size: fs.statSync(r.filePaths[0]).size }; },
  utilsHash: async ({ algo, expected }) => { if (!utilsPick.file) throw new Error('Choose a file first'); const r = utils.hashFile(utilsPick.file, String(algo || 'sha256')); return { ...r, path: utilsPick.file, match: expected ? utils.sameHash(r.hash, expected) : null }; },
  utilsPickFolder: async ({ slot }) => { if (!['a', 'b', 'empty', 'manifest'].includes(slot)) throw new Error('Bad slot'); const p = await pickDir(slot === 'empty' ? 'Choose a folder to search for empty folders' : 'Choose folder ' + slot.toUpperCase()); if (!p) return null; utilsPick[slot] = p; return p; },
  utilsCompare: async () => { if (!utilsPick.a || !utilsPick.b) throw new Error('Choose both folders first'); utilsOk.clear(); const r = utils.compareFolders(utilsPick.a, utilsPick.b); for (const k of [...r.onlyA, ...r.different.map((d) => d.path)]) utilsOk.add(path.resolve(utilsPick.a, k)); for (const k of [...r.onlyB, ...r.different.map((d) => d.path)]) utilsOk.add(path.resolve(utilsPick.b, k)); return { ...r, a: utilsPick.a, b: utilsPick.b }; },
  utilsEmptyScan: async () => { if (!utilsPick.empty) throw new Error('Choose a folder first'); utilsOk.clear(); const list = utils.findEmptyDirs(utilsPick.empty); for (const p of list) utilsOk.add(path.resolve(p)); return { root: utilsPick.empty, empty: list }; },
  utilsManifestMake: async () => {
    if (!utilsPick.manifest) throw new Error('Choose a folder first'); const mf = utils.makeManifest(utilsPick.manifest);
    const r = await dialog.showSaveDialog({ title: 'Save the checksum list as', defaultPath: path.join(path.dirname(utilsPick.manifest), path.basename(utilsPick.manifest) + '.sha256') }); if (r.canceled || !r.filePath) return null;
    if (fs.existsSync(r.filePath)) throw new Error('That file already exists. Pick a new name.'); fs.writeFileSync(r.filePath, mf.text, { flag: 'wx' }); return { path: r.filePath, count: mf.count, bytes: mf.bytes };
  },
  utilsManifestCheck: async () => {
    if (!utilsPick.manifest) throw new Error('Choose a folder first'); const r = await dialog.showOpenDialog({ title: 'Choose the checksum list (.sha256 or .txt)', properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null;
    const st = fs.statSync(r.filePaths[0]); if (st.size > 5000000) throw new Error('That file is too big to be a checksum list'); return { ...utils.verifyManifest(utilsPick.manifest, fs.readFileSync(r.filePaths[0], 'utf8')), root: utilsPick.manifest, list: r.filePaths[0] };
  },
  utilsReveal: async ({ path: p }) => { const r = path.resolve(String(p || '')); if (!utilsOk.has(r) || !fs.existsSync(r)) throw new Error('Scan first, then pick an item from the list'); shell.showItemInFolder(r); return true; }
});
/* ---------- Vorynth OS: download, check and join the image (see lib/osimage.js). Slow jobs run in a worker so the window stays responsive. ---------- */
const osimage = require('./lib/osimage'); const heavy = require('./lib/heavy');
const osJob = { id: 0, kind: '', state: 'idle', done: 0, total: 0, result: null, error: '' }; let osAbort = null; let osLast = '';
const osBegin = (kind) => { if (osJob.state === 'running') throw new Error('Wait for the current job to finish first'); osJob.id++; Object.assign(osJob, { kind, state: 'running', done: 0, total: 0, result: null, error: '' }); const id = osJob.id; return { id, prog: (p) => { if (osJob.id === id) { osJob.done = p.done; osJob.total = p.total; } }, finish: (r) => { if (osJob.id === id) { osJob.state = 'done'; osJob.result = r; } }, fail: (e) => { if (osJob.id === id) { osJob.state = 'error'; osJob.error = String((e && e.message) || e); } } }; };
Object.assign(handlers, {
  osInfo: async () => osimage.info(),
  osStatus: async () => ({ ...osJob }),
  osCancel: async () => { if (osAbort) { osAbort.abort(); osAbort = null; } if (osJob.state === 'running') { osJob.state = 'error'; osJob.error = 'Cancelled'; osJob.id++; } return true; },
  osPartsPick: async () => {
    const r = await dialog.showOpenDialog({ title: 'Choose ALL the Vorynth OS parts (Ctrl+A selects everything)', properties: ['openFile', 'multiSelections'] }); if (r.canceled || !r.filePaths.length) return null;
    const list = r.filePaths.filter((p) => !/\.sha256$/i.test(p)).slice(0, 2000).sort((a, b) => joiner.natural(path.basename(a), path.basename(b))); if (!list.length) throw new Error('No parts were chosen');
    joinOk.clear(); for (const p of list) joinOk.add(path.resolve(p)); const j = osBegin('parts');
    heavy.run('checkParts', { files: list }, j.prog).then((check) => j.finish({ parts: list.map((p) => ({ name: path.basename(p), size: fs.statSync(p).size })), check, expected: osimage.DATA.parts.length })).catch(j.fail); return { started: true };
  },
  osJoin: async () => {
    if (!joinOk.size) throw new Error('Choose the parts first'); const parts = [...joinOk]; const dir = path.dirname(parts[0]);
    const r = await dialog.showSaveDialog({ title: 'Save the Vorynth OS image as', defaultPath: path.join(dir, osimage.DATA.iso.name) }); if (r.canceled || !r.filePath) return null; const out = r.filePath; const j = osBegin('join');
    heavy.run('join', { parts, out }, j.prog).then((res) => { joinLast = res.path; osLast = res.path; j.finish(res); }).catch(j.fail); return { started: true };
  },
  osVerifyPick: async () => {
    const r = await dialog.showOpenDialog({ title: 'Choose the Vorynth OS image (.iso)', properties: ['openFile'], filters: [{ name: 'Disc image', extensions: ['iso'] }] }); if (r.canceled || !r.filePaths[0]) return null; const file = r.filePaths[0]; const j = osBegin('verify'); osLast = file;
    heavy.run('verifyIso', { file }, j.prog).then((res) => j.finish({ ...res, path: file })).catch(j.fail); return { started: true };
  },
  osDownload: async ({ url }) => {
    let u; try { u = new URL(String(url || '').trim()); } catch (_) { throw new Error('Paste the full web address (it must start with https://)'); } if (u.protocol !== 'https:') throw new Error('Only secure (https) addresses are allowed');
    const r = await dialog.showSaveDialog({ title: 'Save the Vorynth OS image as', defaultPath: path.join(app.getPath('downloads'), osimage.DATA.iso.name) }); if (r.canceled || !r.filePath) return null; const dest = r.filePath; const j = osBegin('download'); osAbort = new AbortController(); const sig = osAbort.signal;
    osimage.downloadIso(u.toString(), dest, { onProgress: (d, t) => j.prog({ done: d, total: t || osimage.DATA.iso.size }), signal: sig }).then((res) => { osLast = dest; j.finish({ path: dest, bytes: res.bytes, sha256: res.sha256 }); }).catch((e) => j.fail(sig.aborted ? new Error('Cancelled') : e)); return { started: true };
  },
  osReveal: async () => { if (!osLast || !fs.existsSync(osLast)) throw new Error('Nothing to show yet'); shell.showItemInFolder(osLast); return true; },
  osOpenSite: async ({ site }) => { if (!Object.prototype.hasOwnProperty.call(osimage.SITES, site)) throw new Error('Unknown site'); await shell.openExternal(osimage.SITES[site]); return true; }
});

/* ---------- Vorynth OS desktop look (macOS style): calls /usr/local/bin/aurora-look ---------- */
const LOOK_BIN = '/usr/local/bin/aurora-look';
const LOOK_RULES = {
  theme: [['light', 'dark']], accent: [['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'grey']],
  'dock-position': [['bottom', 'left', 'right']], 'dock-size': ['int:24:96'], 'dock-zoom': [['on', 'off']],
  layout: [['mac', 'windows', 'chromeos', 'ubuntu']], 'dock-hide': [['none', 'intelligent', 'auto', 'dodge-active']], menubar: [['solid', 'glass']], buttons: [['mac', 'windows']],
  wallpaper: ['wall'], cursor: ['curs', 'int:16:64'], blur: [['on', 'off']], nightshift: [['on', 'off']], hotcorners: [['on', 'off']],
  corner: [['tl', 'tr', 'bl', 'br'], ['none', 'overview', 'desktop', 'lock', 'spotlight', 'screensaver']],
};
const lookWalls = () => { try { return fs.readdirSync('/usr/share/backgrounds/aurora').filter((f) => /\.jpg$/i.test(f)).map((f) => f.replace(/\.jpg$/i, '')).sort(); } catch (_) { return []; } };
const lookCurs = () => { try { const o = []; for (const d of ['/usr/share/icons', require('path').join(require('os').homedir(), '.icons'), require('path').join(require('os').homedir(), '.local/share/icons')]) { try { for (const n of fs.readdirSync(d)) if (fs.existsSync(require('path').join(d, n, 'cursors'))) o.push(n); } catch (_) {} } return [...new Set(o)].sort(); } catch (_) { return []; } };
const lookOk = (cmd, args) => {
  const rule = LOOK_RULES[cmd]; if (!rule || args.length !== rule.length) return false;
  return rule.every((r, i) => { const v = String(args[i]); if (Array.isArray(r)) return r.includes(v); if (r === 'wall') return lookWalls().includes(v); if (r === 'curs') return /^[\w.\- ]{1,60}$/.test(v) && lookCurs().includes(v); const [, lo, hi] = r.split(':'); return /^\d+$/.test(v) && +v >= +lo && +v <= +hi; });
};
Object.assign(handlers, {
  lookGet: async () => {
    if (process.platform !== 'linux' || !fs.existsSync(LOOK_BIN)) return { available: false };
    const out = await new Promise((res) => execFile(LOOK_BIN, ['get'], { timeout: 8000, encoding: 'utf8' }, (e, o) => res(e ? '' : o)));
    const styles = await new Promise((res) => execFile('/usr/local/bin/aurora-style', ['list'], { timeout: 5000, encoding: 'utf8' }, (e, o) => res(e ? [] : o.trim().split('\n').map((l) => l.split('|')))));
    const style = await new Promise((res) => execFile('/usr/local/bin/aurora-style', ['current'], { timeout: 5000, encoding: 'utf8' }, (e, o) => res(e ? 'aurora' : o.trim())));
    try { return { available: true, wallpapers: lookWalls(), cursors: lookCurs(), styles, style, ...JSON.parse(out) }; } catch (_) { return { available: false }; }
  },
  lookSet: async ({ cmd, args }) => {
    args = Array.isArray(args) ? args.map(String) : [];
    if (process.platform !== 'linux' || !fs.existsSync(LOOK_BIN)) throw new Error('Only on Vorynth OS');
    if (String(cmd) === 'style') {
      if (args.length !== 1 || !/^[a-z0-9-]{1,24}$/.test(args[0])) throw new Error('That style is not allowed');
      await new Promise((res, rej) => execFile('/usr/local/bin/aurora-style', [args[0]], { timeout: 60000 }, (e) => (e ? rej(new Error('Could not apply: ' + e.message.split('\n')[0])) : res())));
      return true;
    }
    if (!lookOk(String(cmd), args)) throw new Error('That setting is not allowed');
    await new Promise((res, rej) => execFile(LOOK_BIN, [String(cmd), ...args], { timeout: 15000 }, (e) => (e ? rej(new Error('Could not apply: ' + e.message.split('\n')[0])) : res())));
    return true;
  },
  tweakList: async () => {
    if (process.platform !== 'linux' || !fs.existsSync('/usr/local/bin/aurora-tweak')) return { available: false };
    const out = await new Promise((res) => execFile('/usr/local/bin/aurora-tweak', ['list'], { timeout: 20000, encoding: 'utf8', maxBuffer: 4e6 }, (e, o) => res(e ? '' : o)));
    try { return { available: true, items: JSON.parse(out) }; } catch (_) { return { available: false }; }
  },
  tweakSet: async ({ id, value }) => {
    if (process.platform !== 'linux') throw new Error('Only on Vorynth OS');
    id = String(id); value = String(value);
    if (!/^[a-z0-9-]{3,80}$/.test(id) || value.length > 90) throw new Error('That setting is not allowed');
    await new Promise((res, rej) => execFile('/usr/local/bin/aurora-tweak', ['set', id, value], { timeout: 15000 }, (e, o, er) => (e ? rej(new Error((er || e.message).split('\n')[0])) : res())));
    return true;
  },
  tweakReset: async ({ id }) => {
    if (process.platform !== 'linux') throw new Error('Only on Vorynth OS');
    id = String(id || '');
    if (id !== 'all' && !/^[a-z0-9-]{3,80}$/.test(id)) throw new Error('That setting is not allowed');
    await new Promise((res, rej) => execFile('/usr/local/bin/aurora-tweak', [id === 'all' ? 'reset-all' : 'reset', ...(id === 'all' ? [] : [id])], { timeout: 30000 }, (e) => (e ? rej(new Error('Could not reset')) : res())));
    return true;
  },
  lookApp: async ({ what }) => {
    const map = { spotlight: ['aurora-spotlight', []], control: ['aurora-control', []], update: ['aurora-update', []], missioncontrol: ['xfdashboard', ['-t']], launchpad: ['aurora-launchpad', []], backup: ['aurora-backup', []], about: ['aurora-about', []],
      games: ['aurora-games', []], download: ['aurora-download', []], store: ['gnome-software', []], dex: ['aurora-dex', []], quickshare: ['aurora-quickshare', []], eyes: ['aurora-eyes', []], dnd: ['aurora-dnd', []], network: ['aurora-network', []], playstore: ['aurora-playstore', []], buds: ['aurora-buds', []], tools: ['aurora-tools', []], security: ['aurora-security', ['menu']],
      greet: ['aurora-greet', []], greetname: ['aurora-greet', ['name']], prayer: ['aurora-prayer', ['menu']], epic: ['aurora-epic', ['menu']], livewall: ['aurora-livewall', ['menu']], hud: ['aurora-hud', ['toggle']], hacker: ['aurora-hacker', []], appstore: ['aurora-appstore', []], gamestore: ['aurora-gamestore', []], cosmetics: ['aurora-cosmetics', []], repair: ['aurora-repair', []], safelook: ['aurora-repair', ['safe']], emoji: ['aurora-emoji', []], updateall: ['aurora-update', []], tour: ['aurora-welcome', []], fetch: ['aurora-fetch', []], dropterm: ['xfce4-terminal', ['--drop-down']], autonoise: ['aurora-autonoise', ['on']], autonoiseoff: ['aurora-autonoise', ['off']], hotspot: ['aurora-hotspot', []], qr: ['aurora-qr', []], weather: ['aurora-weather', []], autoclick: ['aurora-autoclick', ['menu']], linuxgames: ['aurora-linuxgames', []], androidgames: ['aurora-playstore', ['games']], androidtune: ['aurora-playstore', ['tune']], playstore: ['aurora-playstore', []],
      brand: ['aurora-brand', ['menu']], gameboost: ['aurora-brand', ['gameboost']], ocr: ['aurora-brand', ['ocr']], record: ['aurora-brand', ['record']], sidebar: ['aurora-brand', ['sidebar']], zen: ['aurora-brand', ['zen', '25']], clean: ['aurora-brand', ['clean']], routine: ['aurora-brand', ['routine']], popup: ['aurora-brand', ['popup']], quicklook: ['aurora-brand', ['quicklook']], usage: ['aurora-brand', ['usage']], nvidia: ['aurora-hw', ['nvidia']], ryzen: ['aurora-hw', ['ryzen']], hwinfo: ['aurora-hw', ['info']], storesearch: ['aurora-storesearch', []], stores: ['aurora-stores', ['menu']], clip: ['aurora-clip', []], pulse: ['aurora-pulse', []], awake: ['aurora-awake', ['toggle']], emoji: ['aurora-emoji', []], timer: ['aurora-timer', []], dailywall: ['aurora-dailywall', []], mods: ['aurora-hw', ['mods']],
      drivers: ['x-terminal-emulator', ['-T', 'Drivers', '-e', 'sh', '-c', 'aurora-drivers install; echo; echo Press Enter; read x']] };
    const it = map[what]; if (!it || process.platform !== 'linux') throw new Error('Only on Vorynth OS');
    require('child_process').spawn(it[0], it[1], { detached: true, stdio: 'ignore' }).unref(); return true;
  },
});


/* Vorynth OS display: refresh rate picker (calls /usr/local/bin/aurora-refresh) */
const REFRESH_BIN = '/usr/local/bin/aurora-refresh';
Object.assign(handlers, {
  displayGet: async () => {
    if (process.platform !== 'linux' || !fs.existsSync(REFRESH_BIN)) return { available: false };
    const out = await new Promise((res) => execFile(REFRESH_BIN, ['list'], { timeout: 8000, encoding: 'utf8' }, (e, o) => res(e ? '' : o)));
    try { return { available: true, monitors: JSON.parse(out) }; } catch (_) { return { available: false }; }
  },
  displaySet: async ({ output, res, rate }) => {
    if (process.platform !== 'linux' || !fs.existsSync(REFRESH_BIN)) throw new Error('Only on Vorynth OS');
    if (!/^[A-Za-z0-9_.-]+$/.test(String(output)) || !/^\d+x\d+$/.test(String(res)) || !/^\d+(\.\d+)?$/.test(String(rate))) throw new Error('That display setting is not allowed');
    await new Promise((ok, no) => execFile(REFRESH_BIN, ['set', String(output), String(res), String(rate)], { timeout: 15000 }, (e) => (e ? no(new Error('The monitor did not accept that mode')) : ok())));
    return true;
  },
  displayBest: async () => {
    if (process.platform !== 'linux' || !fs.existsSync(REFRESH_BIN)) throw new Error('Only on Vorynth OS');
    await new Promise((ok) => execFile(REFRESH_BIN, [], { timeout: 20000 }, () => ok())); return true;
  },
});


/* Vorynth OS audio modes (calls /usr/local/bin/aurora-audio) */
const AUDIO_BIN = '/usr/local/bin/aurora-audio';
const AUDIO_OK = { mode: ['music', 'movie', 'call', 'gaming', 'night'], codec: ['ldac', 'aptx_hd', 'aptx', 'aac', 'sbc_xq', 'sbc'], 'mic-cancel': ['on', 'off'], eq: ['bass', 'vocal', 'treble', 'off'] };
Object.assign(handlers, {
  audioStatus: async () => {
    if (process.platform !== 'linux' || !fs.existsSync(AUDIO_BIN)) return { available: false };
    const out = await new Promise((res) => execFile(AUDIO_BIN, ['status'], { timeout: 8000, encoding: 'utf8' }, (e, o) => res(e ? '' : o)));
    return { available: true, text: out.trim() };
  },
  audioSet: async ({ cmd, value }) => {
    if (process.platform !== 'linux' || !fs.existsSync(AUDIO_BIN)) throw new Error('Only on Vorynth OS');
    if (!AUDIO_OK[cmd] || !AUDIO_OK[cmd].includes(String(value))) throw new Error('That audio setting is not allowed');
    const out = await new Promise((res) => execFile(AUDIO_BIN, [cmd, String(value)], { timeout: 30000, encoding: 'utf8' }, (e, o) => res((o || '').trim() || (e ? 'It did not work' : 'Done'))));
    return out.split('\n').pop();
  },
});

const PURE_NODE_CALLS = ['btAudioInfo', 'btAudioSetProfile', 'fileLockEncrypt', 'fileLockDecrypt', 'diagReport', 'diagSave', 'diskScan', 'diskRoots', 'diskReveal', 'dupScanPath', 'doctorScan', 'gpuMon', 'pcRate', 'audioStatus', 'audioSet', 'displayGet', 'displaySet', 'displayBest', 'lookGet', 'lookSet', 'tweakList', 'tweakSet', 'tweakReset', 'lookApp', 'stats', 'appVersion', 'widgetList', 'widgetOpen', 'widgetClose', 'widgetSet', 'exportSettings', 'importSettings', 'storeGet', 'storeSet', 'activityGet', 'ruleTest', 'profilesList', 'profileRun', 'guardCapture', 'guardRun', 'watchdogGet', 'organizePlan', 'organizeApply', 'organizeUndo', 'dupScan', 'wifiQr', 'clipGet', 'clipUse', 'clipPin', 'clipDelete', 'clipClear', 'revealFile', 'trashFile', 'openPath', 'padOpen', 'padSave', 'screenSnap', 'clipImage', 'qrMake', 'renamePick', 'renameApply', 'saveBatch', 'updateInfo', 'updateSettings', 'updateCheck', 'updateStatus', 'updateDownload', 'updatePickFile', 'updateUseFound', 'updateApply', 'updateDiscard', 'windowPin', 'windowZoom', 'snapList', 'snapCapture', 'snapDiff', 'snapRestore', 'snapDelete', 'netDns', 'netPort', 'netSsl', 'netHeaders', 'netPublicIp', 'netWol', 'dropStart', 'dropStop', 'dropStatus', 'diskSpeed', 'pdfPick', 'pdfMerge', 'pdfExtract', 'pdfRotate', 'pdfSplitAll', 'zipPick', 'zipMake', 'zipOpen', 'zipUnpack', 'dataExport', 'dataImport', 'addonList', 'addonStage', 'addonInstall', 'addonDiscard', 'addonSetEnabled', 'addonRemove', 'addonExport', 'addonStorage', 'addonClipboard', 'addonNotify', 'addonScreen', 'spacePick', 'spaceScan', 'spaceReveal', 'platformInfo', 'sysinfo', 'drives', 'joinPick', 'joinRun', 'joinReveal', 'utilsPickFile', 'utilsHash', 'utilsPickFolder', 'utilsCompare', 'utilsEmptyScan', 'utilsReveal', 'utilsManifestMake', 'utilsManifestCheck', 'addonLibrary', 'osInfo', 'osStatus', 'osCancel', 'osPartsPick', 'osJoin', 'osVerifyPick', 'osDownload', 'osReveal', 'osOpenSite', 'addonRead'];


/* ---------- Desktop widgets: small always-there windows (clock, meters, notes ...) ---------- */
const WIDGETS = {
  clock: ['Clock', 'Big time and date', 260, 130], analog: ['Analog clock', 'A smooth round clock', 180, 180], meter: ['System meter', 'Processor, memory and uptime', 270, 150],
  notes: ['Notes', 'A sticky note for quick thoughts', 260, 240], calendar: ['Calendar', 'This month at a glance', 250, 230], countdown: ['Countdown', 'Days until something you care about', 260, 190],
  stopwatch: ['Stopwatch', 'Start, stop, reset', 260, 140], todo: ['To-do list', 'A short checklist', 260, 260], quote: ['Daily line', 'A short line for the day', 260, 140], worldclock: ['World clock', 'Four time zones', 240, 150]
};
const widgetWins = new Map(), widgetClosing = new WeakSet();
const widgetFile = () => path.join(app.getPath('userData'), 'widgets.json');
const widgetCfg = () => { try { const j = JSON.parse(fs.readFileSync(widgetFile(), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (_) { return {}; } };
const widgetSave = (cfg) => { try { fs.writeFileSync(widgetFile(), JSON.stringify(cfg)); } catch (e) { logError(e); } };
const widgetKind = (k) => { if (typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(WIDGETS, k)) throw new Error('Unknown widget'); return k; };
const widgetOnScreen = (x, y, w, h) => electron.screen.getAllDisplays().some((d) => x + 40 > d.workArea.x && y + 20 > d.workArea.y && x < d.workArea.x + d.workArea.width - 40 && y < d.workArea.y + d.workArea.height - 20);
function widgetOpenWin(kind) {
  if (widgetWins.has(kind) && !widgetWins.get(kind).isDestroyed() && !widgetClosing.has(widgetWins.get(kind))) return widgetWins.get(kind);
  const cfg = widgetCfg(), c = cfg[kind] || {}, [, , w, h] = WIDGETS[kind];
  const wa = electron.screen.getPrimaryDisplay().workArea, idx = Object.keys(WIDGETS).indexOf(kind);
  let x = Number.isFinite(c.x) ? Math.round(c.x) : wa.x + wa.width - w - 24, y = Number.isFinite(c.y) ? Math.round(c.y) : wa.y + 24 + (idx % 5) * 40;
  if (!widgetOnScreen(x, y, w, h)) { x = wa.x + wa.width - w - 24; y = wa.y + 24; }
  const win = new BrowserWindow({ width: w, height: h, x, y, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, hasShadow: false, show: false, title: 'Vorynth widget', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'widget.html'), { query: { kind } });
  win.once('ready-to-show', () => { win.setOpacity(Math.min(1, Math.max(0.3, Number(c.opacity) || 1))); if (c.locked) win.setIgnoreMouseEvents(true, { forward: true }); win.showInactive(); });
  let tm = null; win.on('move', () => { clearTimeout(tm); tm = setTimeout(() => { if (win.isDestroyed()) return; const [nx, ny] = win.getPosition(), cf = widgetCfg(); cf[kind] = { ...(cf[kind] || {}), x: nx, y: ny }; widgetSave(cf); }, 400); });
  win.on('closed', () => { if (widgetWins.get(kind) === win) widgetWins.delete(kind); });
  widgetWins.set(kind, win); return win;
}
const widgetState = () => { const cfg = widgetCfg(); return Object.keys(WIDGETS).map((k) => ({ kind: k, name: WIDGETS[k][0], note: WIDGETS[k][1], open: widgetWins.has(k) && !widgetWins.get(k).isDestroyed() && !widgetClosing.has(widgetWins.get(k)), opacity: Math.min(1, Math.max(0.3, Number((cfg[k] || {}).opacity) || 1)), locked: !!(cfg[k] || {}).locked })); };
Object.assign(handlers, {
  widgetList: async () => widgetState(),
  widgetOpen: async ({ kind }) => { widgetKind(kind); widgetOpenWin(kind); const cf = widgetCfg(); cf[kind] = { ...(cf[kind] || {}), open: true }; widgetSave(cf); return widgetState(); },
  widgetClose: async ({ kind }) => { widgetKind(kind); const w = widgetWins.get(kind); const cf = widgetCfg(); cf[kind] = { ...(cf[kind] || {}), open: false }; widgetSave(cf); if (w && !w.isDestroyed()) { widgetClosing.add(w); w.close(); } return widgetState(); },
  widgetSet: async ({ kind, opacity, locked }) => {
    widgetKind(kind); const cf = widgetCfg(), c = { ...(cf[kind] || {}) }, w = widgetWins.get(kind);
    if (opacity !== undefined) { const o = Number(opacity); if (!Number.isFinite(o)) throw new Error('Bad opacity'); c.opacity = Math.min(1, Math.max(0.3, o)); if (w && !w.isDestroyed()) w.setOpacity(c.opacity); }
    if (locked !== undefined) { c.locked = !!locked; if (w && !w.isDestroyed()) w.setIgnoreMouseEvents(c.locked, { forward: true }); }
    cf[kind] = c; widgetSave(cf); return widgetState();
  }
});
const widgetRestore = () => { try { const cf = widgetCfg(); for (const k of Object.keys(WIDGETS)) if (cf[k] && cf[k].open) widgetOpenWin(k); } catch (e) { logError(e); } };

ipcMain.handle('call', async (_e, name, args) => {
  // Own properties only: names like "constructor" or "__proto__" must never resolve to built-in functions.
  const h = typeof name === 'string' && Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : null;
  if (typeof h !== 'function') throw new Error('Unknown call');
  if (!isWin && !PURE_NODE_CALLS.includes(name)) throw new Error('Windows only');
  return h(args || {});
});

/* ---------- Error reporting (so a failed start is never silent) ---------- */
function logError(err) {
  const msg = (err && (err.stack || err.message)) || String(err);
  try { fs.appendFileSync(path.join(__dirname, 'aurora-error.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
  try { dialog.showErrorBox('Vorynth Settings hit a problem', msg.slice(0, 1500) + '\n\n(also saved to aurora-error.log)'); } catch (_) {}
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);

/* ---------- Window ---------- */
// Mica needs Windows 11 22H2 (build 22621) or newer. Everything else gets a solid background.
const winBuild = isWin ? Number((os.release().split('.')[2]) || 0) : 0;
const hasMica = winBuild >= 22621;

function createWindow() {
  const base = {
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#12141a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
  const fancy = hasMica
    ? { ...base, backgroundColor: '#00000000', backgroundMaterial: 'mica', titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#888888', height: 40 } }
    : { ...base, titleBarStyle: 'hidden', titleBarOverlay: { color: '#12141a', symbolColor: '#888888', height: 40 } };

  let win;
  try { win = new BrowserWindow(fancy); }
  catch (e) { logError(e); win = new BrowserWindow(base); } // plain window as a last resort

  mainWin = win;
  const startHidden = process.argv.includes('--hidden') && integration.store.get().settings.background && integration.background.hasTray();
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  setTimeout(() => { if (!startHidden && !win.isDestroyed() && !win.isVisible()) win.show(); }, 4000); // never stay hidden
  // Closing the window keeps Vorynth running in the tray (only if a tray icon really exists, so it can never become invisible).
  win.on('close', (e) => {
    if (quitting || !integration.store.get().settings.background || !integration.background.hasTray()) return;
    e.preventDefault(); win.hide();
    if (!trayNoteShown) { trayNoteShown = true; integration.notify('Vorynth is still running in the tray. Right-click the icon to quit.'); }
  });
  // Only a failure of Vorynth's own page matters. A frame that an add-on tries to load (and that the add-on policy blocks) must never pop up a dialog or freeze the window.
  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => { if (isMainFrame && code !== -3) logError(new Error(`Page failed to load: ${desc} (${code})`)); });
  win.webContents.on('render-process-gone', (_e, d) => logError(new Error('Renderer crashed: ' + d.reason)));
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

let launcher = null; const LAUNCHER_ONLY = process.argv.includes('--launcher-only');
// A second launch just focuses the existing window instead of silently doing nothing.
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => { if (argv.includes('--toggle-launcher') && launcher) launcher.toggle(); else if (argv.includes('--launcher-only') && launcher) launcher.show(); else showMainWindow(); });
  app.whenReady().then(() => {
    integration.init();
    try {
      launcher = require('./lib/launcher').createLauncher({ electron, app, log: logError, openAuroraPage: (pg) => { showMainWindow(); try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('goto', String(pg)); } catch (_) { /* ignore */ } } });
      launcher.init();
    } catch (e) { logError(e); }
    if (!LAUNCHER_ONLY) createWindow();
    startAutoDetect(); widgetRestore();
  }).catch(logError);
  app.on('before-quit', () => { quitting = true; integration.dispose(); });
  app.on('window-all-closed', () => { if (LAUNCHER_ONLY) return; if (!integration.store.get().settings.background || !integration.background.hasTray()) app.quit(); });
}

if (process.env.AURORA_TEST) module.exports = { addonInstaller, drop, tk, selfUpd, detectUpdates, appStore, buildReportHtml, CORE_SERVICES, integration, handlers, runSpeedTest, parseBatteryXml, parseWifiXml, insideHome, rootExpr, wuInstallScript, readWuState, wuDir, parseWifiScan, parseWifiProfiles, parseWifiCurrent, buildWifiProfileXml, parsePowerQuery, DISPLAY_CS, MOUSE_CS };
