// Bluetooth audio and LDAC. What is really possible:
//  - Linux (PipeWire / PulseAudio): LDAC is a normal A2DP profile ("a2dp-sink-ldac") that can be listed and switched at runtime. Vorynth does that.
//  - Windows: Windows' Bluetooth stack has no LDAC (SBC and AAC only, plus aptX with some drivers) and exposes no public API to read or
//    change the codec in use. Vorynth cannot add a codec to Windows. It lists your Bluetooth audio devices, says honestly what Windows can do,
//    and points to the real options.
const { execFile } = require('child_process');

const CARD_RE = /^bluez_card\.[0-9A-Fa-f_]+$/;
const PROFILE_RE = /^[A-Za-z0-9_.:+-]{1,80}$/;
// Quality order for display only (best first). "ldac" appears as a2dp-sink-ldac (profile) in PipeWire/PulseAudio.
const CODECS = [['ldac', 'LDAC', 'Up to 990 kbps, Sony high-resolution codec'], ['aptx_hd', 'aptX HD', 'Qualcomm, 24-bit'], ['aptx_ll', 'aptX Low Latency', 'Qualcomm, tuned for video and games'], ['aptx', 'aptX', 'Qualcomm'], ['aac', 'AAC', 'Good quality, common on Apple and Android'], ['sbc_xq', 'SBC-XQ', 'Higher-bitrate SBC'], ['sbc', 'SBC', 'The mandatory baseline codec'], ['lc3', 'LC3', 'Bluetooth LE Audio']];
const codecOfProfile = (name) => { const m = /^a2dp-sink-(.+)$/.exec(String(name)); if (!m) return null; const id = m[1].toLowerCase().replace(/-/g, '_'); return CODECS.find((c) => c[0] === id) ? id : id; };
const codecLabel = (id) => { const c = CODECS.find((x) => x[0] === id); return c ? c[1] : String(id).toUpperCase(); };

// pactl --format=json list cards  ->  [{ card, name, address, active, profiles: [{ id, codec, label, available }], ldac: { available, active } }]
function parseLinuxCards(json) {
  let cards; try { cards = typeof json === 'string' ? JSON.parse(json) : json; } catch (_) { throw new Error('Could not read the audio system output'); }
  if (!Array.isArray(cards)) return [];
  return cards.filter((c) => c && typeof c.name === 'string' && CARD_RE.test(c.name)).map((c) => {
    const props = c.properties || {}; const active = c.active_profile || ''; const profiles = Object.entries(c.profiles || {}).map(([id, p]) => ({ id, codec: codecOfProfile(id), label: (p && p.description) || id, available: !(p && (p.available === false || p.available === 'no')) })).filter((p) => p.codec || /^a2dp-sink|headset|hfp|hsp|^off$/i.test(p.id));
    // PipeWire names the default mode plain "a2dp-sink" and only says the codec in its description ("... codec SBC")
    const descCodec = (id) => { const d = (c.profiles && c.profiles[id] && c.profiles[id].description) || ''; const m = /codec ([A-Za-z0-9_ -]+?)\)?$/i.exec(String(d).trim()); if (!m) return null; const want = m[1].trim().toLowerCase().replace(/[ -]/g, '_'); const hit = CODECS.find((x) => x[0] === want || x[1].toLowerCase().replace(/[ -]/g, '_') === want); return hit ? hit[0] : null; };
    for (const p of profiles) if (!p.codec && /^a2dp-sink/.test(p.id)) p.codec = descCodec(p.id) || 'sbc_or_default';
    const ldac = profiles.find((p) => p.codec === 'ldac');
    return { card: c.name, name: props['device.description'] || props['device.alias'] || c.name, address: (c.name.replace(/^bluez_card\./, '').replace(/_/g, ':')), active, activeCodec: (profiles.find((p) => p.id === active) || {}).codec === 'sbc_or_default' ? null : ((profiles.find((p) => p.id === active) || {}).codec || null), profiles,
      ldac: { available: !!ldac && ldac.available, active: active === (ldac && ldac.id), profile: ldac ? ldac.id : '' } };
  });
}

// Windows: a conservative name check. Windows itself does not tell us the codec, so this is only a hint about the HEADPHONES.
const LDAC_HINTS = /\b(WH-1000XM[3-6]|WF-1000XM[3-5]|LinkBuds S|WH-H910N|WH-XB910N|WI-1000XM2|SRS-XB43|ULT WEAR|ULT FIELD)\b/i;
const likelyLdacHeadphones = (name) => LDAC_HINTS.test(String(name || ''));

function parseWindowsDevices(json) {
  let list; try { list = typeof json === 'string' ? JSON.parse(json || '[]') : json; } catch (_) { return []; }
  if (!Array.isArray(list)) list = list ? [list] : [];
  const seen = new Set(); const out = [];
  for (const d of list) { const name = String((d && (d.FriendlyName || d.name)) || '').trim(); if (!name || /^(Microsoft|Generic|Bluetooth (Radio|Adapter)|Intel|Realtek|Qualcomm|Broadcom|MediaTek)\b/i.test(name) && !/headphone|headset|speaker|buds|wh-|wf-/i.test(name)) continue; const key = name.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push({ name, status: String((d && (d.Status || d.status)) || ''), likelyLdac: likelyLdacHeadphones(name) }); }
  return out;
}
const WINDOWS_SCRIPT = `$ErrorActionPreference='SilentlyContinue'
$d = Get-PnpDevice -Class AudioEndpoint -PresentOnly | Where-Object { $_.InstanceId -match 'BTHENUM|BTH\\\\|BluetoothLE' -or $_.FriendlyName -match 'Bluetooth' } | Select-Object FriendlyName, Status
$r = Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.FriendlyName -match 'Radio|Adapter|Wireless Bluetooth|Generic Bluetooth|Intel|Realtek|MediaTek|Qualcomm' } | Select-Object -First 1 FriendlyName
[pscustomobject]@{ devices = @($d); radio = [string]$r.FriendlyName } | ConvertTo-Json -Compress -Depth 4`;

const WINDOWS_GUIDE = {
  summary: 'Windows does not support LDAC. Its Bluetooth stack only offers SBC and AAC (and aptX on some PCs with Qualcomm drivers), and no app can add a codec to it or read which one a headset is using.',
  options: [
    { title: 'Use a USB Bluetooth transmitter that supports LDAC', body: 'A hardware transmitter does the LDAC encoding itself and shows up in Windows as a normal USB sound card, which is the most reliable way to get LDAC from a PC.' },
    { title: 'Listen on a device that supports LDAC', body: 'Android phones (Android 8 and newer) and most Linux systems support LDAC. You can send the PC audio to a phone and play it there, but that adds delay.' },
    { title: 'Use a wired or USB-C connection for lossless audio', body: 'If your headphones accept a USB or 3.5 mm cable, that avoids Bluetooth compression entirely.' },
    { title: 'Third-party A2DP drivers exist, but check carefully', body: 'Some paid third-party drivers add extra Bluetooth codecs to Windows. Vorynth has not tested any of them. Only install a driver from its official site and make sure it supports your Windows version and Bluetooth chip.' }
  ],
  tips: ['Keep the headphones in stereo mode (A2DP). When a call app opens the microphone, Windows can switch to the low-quality Hands-Free profile.', 'In Sound settings, set the headphones as the default Output and, if you do not need the microphone, turn off the Hands-Free device so Windows stays on stereo.']
};

const run = (file, args, timeout = 8000) => new Promise((resolve, reject) => execFile(file, args, { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => (e ? reject(Object.assign(e, { stderr: err })) : resolve(String(out)))));

function createBtAudio({ platform = process.platform, exec = run, ps } = {}) {
  async function info() {
    if (platform === 'linux') {
      let out; try { out = await exec('pactl', ['--format=json', 'list', 'cards']); } catch (e) { return { platform, supported: false, reason: e.code === 'ENOENT' ? 'The audio tool "pactl" was not found. Install PipeWire or PulseAudio.' : 'Could not read the audio system: ' + String(e.message).split('\n')[0], cards: [] }; }
      const cards = parseLinuxCards(out); return { platform, supported: true, canSwitch: true, cards, ldacPossible: cards.some((c) => c.ldac.available), codecs: CODECS.map(([id, name, note]) => ({ id, name, note })),
        help: cards.length ? (cards.some((c) => c.ldac.profile) ? '' : 'Your headphones or your system do not offer LDAC. LDAC needs headphones that support it and the PipeWire LDAC module (package names: libldac, pipewire-codec-ldac or pulseaudio-module-bluetooth with LDAC).') : 'No Bluetooth audio device is connected. Pair and connect your headphones first.' };
    }
    if (platform === 'win32') {
      let devices = [], radio = ''; try { const raw = ps ? await ps(WINDOWS_SCRIPT, 20000) : ''; const j = raw ? JSON.parse(raw) : {}; devices = parseWindowsDevices(j.devices); radio = String(j.radio || ''); } catch (_) { /* listing is a bonus */ }
      return { platform, supported: false, canSwitch: false, devices, radio, ldacPossible: false, guide: WINDOWS_GUIDE, codecs: CODECS.map(([id, name, note]) => ({ id, name, note })) };
    }
    return { platform, supported: false, canSwitch: false, devices: [], guide: { ...WINDOWS_GUIDE, summary: 'Bluetooth codec control is not available on this system.' } };
  }
  async function setProfile(card, profile) {
    if (platform !== 'linux') throw new Error('Switching the Bluetooth codec is only possible on Linux');
    if (!CARD_RE.test(String(card))) throw new Error('Unknown Bluetooth device'); if (!PROFILE_RE.test(String(profile))) throw new Error('Unknown audio mode');
    const cards = parseLinuxCards(await exec('pactl', ['--format=json', 'list', 'cards'])); const c = cards.find((x) => x.card === card); if (!c) throw new Error('That Bluetooth device is not connected');
    const p = c.profiles.find((x) => x.id === profile); if (!p) throw new Error('That device does not offer this mode'); if (!p.available) throw new Error('That mode is not available right now');
    await exec('pactl', ['set-card-profile', card, profile]); const after = parseLinuxCards(await exec('pactl', ['--format=json', 'list', 'cards'])).find((x) => x.card === card);
    if (!after || after.active !== profile) throw new Error('The device did not switch. It may not support this codec with your current settings.');
    return after;
  }
  return { info, setProfile };
}
module.exports = { createBtAudio, parseLinuxCards, parseWindowsDevices, likelyLdacHeadphones, codecOfProfile, codecLabel, CODECS, WINDOWS_GUIDE, WINDOWS_SCRIPT, CARD_RE };
