const test = require('node:test'); const assert = require('node:assert/strict');
const B = require('../lib/btaudio');
const card = (over = {}) => ({ index: 55, name: 'bluez_card.38_18_4C_AA_BB_CC', properties: { 'device.description': 'WH-1000XM5' }, active_profile: 'a2dp-sink',
  profiles: { off: { description: 'Off', available: true }, 'a2dp-sink': { description: 'High Fidelity Playback (A2DP Sink, codec SBC)', available: true }, 'a2dp-sink-ldac': { description: 'High Fidelity Playback (A2DP Sink, codec LDAC)', available: true }, 'a2dp-sink-aptx': { description: 'aptX', available: false }, 'headset-head-unit': { description: 'Headset Head Unit (HSP/HFP)', available: true }, 'pro-audio': { description: 'Pro Audio', available: true } }, ...over });
const alsa = { index: 1, name: 'alsa_card.pci-0000_00_1f.3', properties: {}, profiles: { 'output:analog-stereo': { description: 'Analog' } }, active_profile: 'output:analog-stereo' };

test('parses Bluetooth cards, ignores non-Bluetooth cards, finds LDAC', () => {
  const cards = B.parseLinuxCards(JSON.stringify([alsa, card()])); assert.equal(cards.length, 1); const c = cards[0];
  assert.equal(c.name, 'WH-1000XM5'); assert.equal(c.address, '38:18:4C:AA:BB:CC'); assert.equal(c.activeCodec, 'sbc'); assert.deepEqual(c.ldac, { available: true, active: false, profile: 'a2dp-sink-ldac' });
  assert.ok(!c.profiles.some((p) => p.id === 'pro-audio'), 'only audio-relevant modes'); assert.equal(c.profiles.find((p) => p.id === 'a2dp-sink-aptx').available, false);
  assert.equal(B.parseLinuxCards(JSON.stringify([card({ active_profile: 'a2dp-sink-ldac' })]))[0].ldac.active, true);
  assert.equal(B.parseLinuxCards([card({ profiles: { off: { description: 'Off' }, 'a2dp-sink': { description: 'x' } } })])[0].ldac.available, false);
  assert.deepEqual(B.parseLinuxCards('[]'), []); assert.deepEqual(B.parseLinuxCards({}), []); assert.throws(() => B.parseLinuxCards('not json'), /Could not read/);
});
test('codec names', () => { assert.equal(B.codecLabel('ldac'), 'LDAC'); assert.equal(B.codecLabel('aptx_hd'), 'aptX HD'); assert.equal(B.codecOfProfile('a2dp-sink-aptx-hd'), 'aptx_hd'); assert.equal(B.codecOfProfile('headset-head-unit'), null); });
test('switching: validates input, only uses listed modes, and verifies the result', async () => {
  let active = 'a2dp-sink'; const calls = [];
  const exec = async (file, args) => { calls.push([file, ...args]); if (args[0] === 'set-card-profile') { if (args[2] !== 'refuse-ldac') active = args[2]; return ''; } return JSON.stringify([card({ active_profile: active })]); };
  const bt = B.createBtAudio({ platform: 'linux', exec }); const name = 'bluez_card.38_18_4C_AA_BB_CC';
  const after = await bt.setProfile(name, 'a2dp-sink-ldac'); assert.equal(after.ldac.active, true); assert.ok(calls.some((c) => c.join(' ') === `pactl set-card-profile ${name} a2dp-sink-ldac`));
  for (const bad of ['x; rm -rf /', '$(id)', '', 'a'.repeat(200)]) await assert.rejects(bt.setProfile(name, bad), /Unknown audio mode/);
  for (const bad of ['alsa_card.pci', 'bluez_card.XX; ls', '']) await assert.rejects(bt.setProfile(bad, 'a2dp-sink'), /Unknown Bluetooth device/);
  await assert.rejects(bt.setProfile(name, 'a2dp-sink-aptx'), /not available right now/); await assert.rejects(bt.setProfile(name, 'does-not-exist'), /does not offer/);
  await assert.rejects(bt.setProfile('bluez_card.00_00_00_00_00_01', 'a2dp-sink'), /not connected/);
  const calls2 = calls.length; await assert.rejects(bt.setProfile(name, 'pro-audio'), /does not offer/); assert.equal(calls.slice(calls2).filter((c) => c[1] === 'set-card-profile').length, 0, 'never runs a command for a rejected request');
});
test('a device that ignores the switch is reported, not claimed as success', async () => {
  const exec = async (f, a) => (a[0] === 'set-card-profile' ? '' : JSON.stringify([card({ active_profile: 'a2dp-sink' })])); await assert.rejects(B.createBtAudio({ platform: 'linux', exec }).setProfile('bluez_card.38_18_4C_AA_BB_CC', 'a2dp-sink-ldac'), /did not switch/);
});
test('Linux info: no pactl, no devices, no LDAC', async () => {
  const miss = B.createBtAudio({ platform: 'linux', exec: async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); } }); const i1 = await miss.info(); assert.equal(i1.supported, false); assert.match(i1.reason, /pactl/);
  assert.match((await B.createBtAudio({ platform: 'linux', exec: async () => '[]' }).info()).help, /No Bluetooth audio device/);
  const noLdac = await B.createBtAudio({ platform: 'linux', exec: async () => JSON.stringify([card({ profiles: { 'a2dp-sink': { description: 'SBC' } } })]) }).info(); assert.equal(noLdac.ldacPossible, false); assert.match(noLdac.help, /LDAC needs/);
});
test('Windows info is honest: no LDAC, no codec switching, lists devices', async () => {
  const ps = async () => JSON.stringify({ devices: [{ FriendlyName: 'Headphones (WH-1000XM5 Hands-Free)', Status: 'OK' }, { FriendlyName: 'Headphones (WH-1000XM5 Stereo)', Status: 'OK' }, { FriendlyName: 'Speaker (JBL Flip 6)', Status: 'OK' }, { FriendlyName: 'Bluetooth Radio', Status: 'OK' }], radio: 'Intel Wireless Bluetooth' });
  const i = await B.createBtAudio({ platform: 'win32', ps }).info(); assert.equal(i.canSwitch, false); assert.equal(i.ldacPossible, false); assert.match(i.guide.summary, /does not support LDAC/);
  assert.deepEqual(i.devices.map((d) => d.name), ['Headphones (WH-1000XM5 Hands-Free)', 'Headphones (WH-1000XM5 Stereo)', 'Speaker (JBL Flip 6)']); assert.equal(i.devices[0].likelyLdac, true); assert.equal(i.devices[2].likelyLdac, false); assert.equal(i.radio, 'Intel Wireless Bluetooth');
  await assert.rejects(B.createBtAudio({ platform: 'win32', ps }).setProfile('bluez_card.AA_BB', 'a2dp-sink-ldac'), /only possible on Linux/);
  assert.equal((await B.createBtAudio({ platform: 'win32', ps: async () => { throw new Error('boom'); } }).info()).devices.length, 0, 'a failing listing never breaks the page');
});
