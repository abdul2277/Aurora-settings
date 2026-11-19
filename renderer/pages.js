/* Page + setting definitions. Each item can be found by the Ctrl+K search. */
/* All backend calls go through here. Toggle reads are merged into one PowerShell run, and volume reads are shared. */
let _pend = [], _pendTimer = null, _vol = null;
function batchedToggleGet(id) {
  return new Promise((res, rej) => {
    _pend.push({ id, res, rej });
    if (_pendTimer) return;
    _pendTimer = setTimeout(async () => {
      const batch = _pend; _pend = []; _pendTimer = null;
      try {
        const r = await window.api.call('toggleGetMany', { ids: [...new Set(batch.map((b) => b.id))] });
        batch.forEach((b) => b.res(r[b.id]));
      } catch (e) { batch.forEach((b) => b.rej(e)); }
    }, 30);
  });
}
const call = (name, args) => {
  if (window.auroraOnCall) { try { window.auroraOnCall(name); } catch (_) { /* never break a call */ } }
  if (name === 'toggleGet') return batchedToggleGet(args.id);
  if (name === 'volumeGet') {
    if (!_vol) { _vol = window.api.call('volumeGet'); _vol.catch(() => {}).then(() => setTimeout(() => { _vol = null; }, 800)); }
    return _vol;
  }
  if (name === 'volumeSet' || name === 'muteSet') _vol = null;
  const r = window.api.call(name, args);
  if (name !== 'diagReport' && name !== 'diagSave') Promise.resolve(r).catch((e) => { const L = (window.__callErrors = window.__callErrors || []); L.push({ at: new Date().toISOString(), call: name, error: String((e && e.message) || e).replace(/^Error invoking remote method 'call': (Error: )?/, '').slice(0, 300) }); if (L.length > 40) L.shift(); });
  return r;
};
const GB = 1024 ** 3;
const fmtBytes = (n) => (n >= GB ? (n / GB).toFixed(1) + ' GB' : (n / 1024 ** 2).toFixed(0) + ' MB');

const ACCENTS = ['#4cc2ff', '#7c8cff', '#c77dff', '#ff6fb5', '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#a0a5b1'];

const toggle = (id, label, desc, kw = '', extra = {}) => ({ type: 'toggle', id, label, desc, kw, ...extra });

window.PAGES = [
  {
    id: 'home', icon: '🏠', title: 'Home', sub: 'Your PC at a glance',
    sections: [{ title: 'Live', items: [{ type: 'custom', id: 'dashboard', label: 'Dashboard CPU memory disk battery', render: 'dashboard' }] }, { title: 'World clocks', items: [{ type: 'custom', id: 'worldclocks', label: 'World clocks time zones cities', kw: 'dubai london new york riyadh time difference', render: 'worldclocks' }] }]
  },

  {
    id: 'system', icon: '💻', title: 'System', sub: 'Display, sound, power and storage',
    sections: [
      {
        title: 'Display', items: [
          { type: 'slider', id: 'brightness', label: 'Brightness', desc: 'Built-in display (laptops)', kw: 'screen light dim',
            load: () => call('brightnessGet'), save: (v) => call('brightnessSet', { value: v }) },
          { type: 'custom', id: 'displays', label: 'Resolution refresh rate monitors', kw: 'hz screen', render: 'displays' },
          { type: 'custom', id: 'displaymodes', label: 'Screen resolution and refresh rate', kw: 'hz monitor 1080p 1440p 4k fps change resolution', render: 'displaymodes' },
          
        ]
      },
      {
        title: 'Sound', items: [
          { type: 'slider', id: 'volume', label: 'Master volume', desc: 'Default output device', kw: 'audio speaker loud',
            load: async () => (await call('volumeGet')).volume, save: (v) => call('volumeSet', { value: v }) },
          toggle('mute', 'Mute', 'Silence the default output', 'audio sound off', {
            load: async () => (await call('volumeGet')).muted, save: (v) => call('muteSet', { value: v }) }),
          
        ]
      },
      {
        title: 'Power & battery', items: [
          { type: 'custom', id: 'powertimeouts', label: 'Screen off and sleep timers', kw: 'sleep screen timeout turn off display idle minutes never sleep', render: 'powertimeouts' },
          { type: 'custom', id: 'battery', label: 'Battery level', render: 'battery' },
          { type: 'custom', id: 'batteryhealth', label: 'Battery health wear capacity cycles', kw: 'laptop battery degraded design capacity', render: 'batteryhealth' },
          { type: 'custom', id: 'powerplans', label: 'Power mode plan performance balanced saver', kw: 'power plan', render: 'powerplans' }
        ]
      },
      {
        title: 'Storage', items: [
          { type: 'custom', id: 'drives', label: 'Storage drives space', kw: 'disk', render: 'drives' },
          { type: 'custom', id: 'disks', label: 'Disks and partitions volumes disk management drive letters', kw: 'disk management partition gpt mbr ssd hdd volume', render: 'disks' },
          { type: 'button', id: 'cleantemp', label: 'Clean temporary files', desc: 'Deletes files in your Temp folder (files in use are skipped)',
            kw: 'cleanup free space junk', btn: 'Clean now',
            run: async () => 'Freed ' + fmtBytes(await call('cleanTemp')) }
        ]
      },
      { title: 'About', items: [{ type: 'custom', id: 'about', label: 'About this PC device name processor ram', kw: 'specs gpu cpu windows version build', render: 'about' }] }
    ]
  },

  {
    id: 'network', icon: '🌐', title: 'Network & internet', sub: 'Adapters, Wi-Fi and DNS',
    sections: [
      { title: 'Connections', items: [{ type: 'custom', id: 'adapters', label: 'Network adapters IP address', kw: 'ethernet wifi mac', render: 'adapters' }] },
      { title: 'Wi-Fi', items: [{ type: 'custom', id: 'wifinative', label: 'Wi-Fi networks connect disconnect join forget saved', kw: 'wireless password join network signal', render: 'wifinative' }] },
      {
        title: 'DNS', items: [
          { type: 'seg', id: 'dns', label: 'DNS provider', desc: 'Applies to all active adapters. Windows will ask for administrator permission.',
            kw: 'cloudflare google quad9 1.1.1.1 8.8.8.8 resolver', options: [['auto', 'Automatic'], ['cloudflare', 'Cloudflare'], ['google', 'Google'], ['quad9', 'Quad9']],
            save: (v) => call('dnsSet', { preset: v }) },
          { type: 'button', id: 'flushdns', label: 'Flush DNS cache', desc: 'Fixes stale lookups', kw: 'ipconfig', btn: 'Flush', run: async () => { await call('flushDns'); return 'DNS cache flushed'; } }
        ]
      },
      { title: 'Internet watchdog', items: [{ type: 'custom', id: 'watchdog', label: 'Internet watchdog outage log connection drops uptime', kw: 'offline down monitor disconnect notify', render: 'watchdog' }] },
      { title: 'Speed test', items: [{ type: 'custom', id: 'speedtest', label: 'Internet speed test download upload ping latency jitter', kw: 'bandwidth mbps slow wifi', render: 'speedtest' }] },
      { title: 'Which apps use the network', items: [{ type: 'custom', id: 'netactivity', label: 'Open ports listening apps connections network activity', kw: 'port 3000 8080 netstat who is using the internet', render: 'netactivity' }] },
      { title: 'Saved Wi-Fi passwords', items: [{ type: 'custom', id: 'wifipasswords', label: 'Saved Wi-Fi passwords reveal forgot password', kw: 'wifi key share recover', render: 'wifipasswords' }] },
      { title: 'VPN', items: [{ type: 'custom', id: 'vpn', label: 'VPN connections connect disconnect', kw: 'vpn tunnel', render: 'vpn' }, ] },
      { title: 'Proxy', items: [{ type: 'custom', id: 'proxy', label: 'Proxy server manual proxy', kw: 'proxy server address port bypass', render: 'proxy' }] }
    ]
  },

  {
    id: 'personalization', icon: '🎨', title: 'Personalization', sub: 'Make Windows yours',
    sections: [
      { title: 'Customize everything', items: [{ type: 'custom', id: 'customize', label: 'Customize everything font accent colour corners sidebar width rename pages icons order background gradient custom css export import theme', kw: 'customize personalise font colour accent radius background rename reorder sidebar css theme export', render: 'customize' }] },
      {
        title: 'Theme', items: [
          toggle('darkMode', 'Dark mode', 'Apps and system surfaces', 'theme light night appearance color'),
          { type: 'accent', id: 'accent', label: 'Accent color', desc: 'Used throughout Vorynth Settings', kw: 'color highlight' },
          toggle('transparency', 'Transparency effects', 'Mica and acrylic surfaces', 'blur glass'),
          { type: 'custom', id: 'autotheme', label: 'Auto dark mode schedule', desc: '', kw: 'schedule automatic sunset sunrise switch theme timer night', render: 'autotheme' }
        ]
      },
      {
        title: 'Taskbar', items: [
          toggle('taskbarCenter', 'Center taskbar icons', 'Off aligns them to the left like Windows 10', 'align left start menu'),
          toggle('taskView', 'Task view button', '', 'virtual desktops'),
          toggle('widgets', 'Widgets button', '', 'news weather'),
          toggle('searchBox', 'Show search box', 'Full search box instead of the icon', 'search taskbar'),
          toggle('showSeconds', 'Show seconds in the clock', '', 'time clock tray')
        ]
      },
      { title: 'More', items: [{ type: 'custom', id: 'spotlight', label: 'Save Windows Spotlight lock screen wallpapers', kw: 'lock screen pictures photos beautiful backgrounds save', render: 'spotlight' }, { type: 'button', id: 'wallpaper', label: 'Set wallpaper from a file', desc: 'Pick any JPG, PNG or BMP', kw: 'background desktop picture image', btn: 'Choose', run: () => call('setWallpaper') },   ] }
    ]
  },

  {
    id: 'apps', icon: '📦', title: 'Apps', sub: 'Installed apps and startup',
    sections: [
      { title: 'Installed', items: [{ type: 'custom', id: 'applist', label: 'Installed apps list uninstall', kw: 'programs software', render: 'applist' }] },
      { title: 'Startup', items: [{ type: 'custom', id: 'startupmgr', label: 'Startup apps manager run at boot turn off', kw: 'autorun boot slow disable enable', render: 'startupmgr' }, ] },
    ]
  },

  {
  id: 'controllers', icon: '🕹️', title: 'Controllers', sub: 'PS5, Xbox, Switch Pro and more: test and navigate',
  sections: [{ title: 'Gamepads', items: [{ type: 'custom', id: 'controllers', label: 'controllers gamepad ps5 dualsense xbox switch pro', kw: 'يد تحكم بلايستيشن اكسبوكس', render: 'controllers' }] }]
}, {
  id: 'diskmap', icon: '💽', title: 'Disk space map', sub: 'See what is eating your storage (treemap)',
  sections: [{ title: 'Storage', items: [{ type: 'custom', id: 'diskmap', label: 'disk space map treemap storage biggest files wiztree', kw: 'مساحة القرص اكبر الملفات تحليل', render: 'diskmap' }] }]
}, {
  id: 'dupes', icon: '🗂️', title: 'Duplicate finder', sub: 'Find identical big files wasting space (read-only)',
  sections: [{ title: 'Storage', items: [{ type: 'custom', id: 'dupes', label: 'duplicate files finder copies wasted space', kw: 'ملفات مكررة مساحة', render: 'dupes' }] }]
}, {
  id: 'mycmds', icon: '⌨️', title: 'My commands', sub: 'Make your own commands and add-ons by typing',
  sections: [{ title: 'Build your own', items: [{ type: 'custom', id: 'mycmds', label: 'my commands macros create add-on addon custom command bar shortcut automation', kw: 'اوامر مخصصة اضافة ماكرو', render: 'mycmds' }] }]
}, {
  id: 'looks', icon: '🎨', title: 'Vorynth looks', sub: 'Themes and the living aurora background',
  sections: [{ title: 'Make it yours', items: [{ type: 'custom', id: 'looks', label: 'theme style accent colour sunset ocean aurora background animation', kw: 'ثيم الوان مظهر خلفية', render: 'looks' }] }]
}, {
  id: 'milestones', icon: '🏆', title: 'Milestones', sub: 'Unlock badges as you use Vorynth',
  sections: [{ title: 'Your progress', items: [{ type: 'custom', id: 'milestones', label: 'milestones achievements badges streak progress', kw: 'انجازات شارات', render: 'milestones' }] }]
}, {
  id: 'autodoc', icon: '🩺', title: 'Vorynth Doctor', sub: 'Diagnose every part of your PC and fix what is broken',
  sections: [{ title: 'Diagnose and repair', items: [{ type: 'custom', id: 'autodoc', label: 'doctor diagnose pc health check repair fix broken cpu gpu ram motherboard drives temperature errors bravebuffer auto fix', kw: 'تشخيص فحص اصلاح الجهاز اعطال معالج كرت شاشة رام لوحة ام', render: 'autodoc' }] }]
}, {
    id: 'gaming', icon: '🎮', title: 'Gaming', sub: 'Performance and capture',
    sections: [{
      title: 'Game features', items: [
        toggle('gameMode', 'Game Mode', 'Prioritises your game while it runs', 'fps performance'),
        toggle('gameBar', 'Xbox Game Bar', 'Open with the controller button', 'xbox capture overlay'),
        
      ]
    }]
  },

  {
    id: 'privacy', icon: '🔒', title: 'Privacy', sub: 'Control what Windows shares',
    sections: [
      { title: 'Privacy score', items: [{ type: 'custom', id: 'privacyscore', label: 'Privacy score harden telemetry ads suggestions', kw: 'secure tracking', render: 'privacyscore' }] },
      { title: 'App permissions', items: [
        toggle('privacyLocation', 'Let apps use your location', 'Turn off to block location for apps on this account', 'gps maps'),
        toggle('privacyCamera', 'Let apps use your camera', 'Turn off to block the webcam for apps on this account', 'webcam video'),
        toggle('privacyMic', 'Let apps use your microphone', 'Turn off to block the microphone for apps on this account', 'audio recording voice')
      ] },
      {
        title: 'Data', items: [
          toggle('suggestions', 'Tips, suggestions and silent app installs', 'Start menu ads and promoted apps', 'ads bloat promoted'),
          toggle('adId', 'Advertising ID', 'Lets apps show more personalised ads', 'ads tracking'),
          toggle('tailored', 'Tailored experiences', 'Tips and ads based on diagnostic data', 'telemetry diagnostics'),
          toggle('clipboardHistory', 'Clipboard history', 'Win + V to paste earlier items', 'copy paste')
        ]
      },
    ]
  },

  {
    id: 'tweaks', icon: '🧪', title: 'Power tweaks', sub: 'The stuff Windows hides',
    sections: [
      { title: 'Optional Vorynth extras', items: [{ type: 'custom', id: 'extras', label: 'Optional extras features switch on off sidebar pages tools store apps plus toolkit toolbox labs profiles automation', kw: 'extras optional features sidebar add remove pages tools store toolbox labs', render: 'extras' }] },
      {
        title: 'File Explorer', items: [
          toggle('fileExt', 'Show file extensions', 'See .txt, .exe, .png and so on', 'explorer'),
          toggle('hiddenFiles', 'Show hidden files', '', 'explorer'),
          toggle('classicMenu', 'Classic right-click menu', 'Skip the "Show more options" step', 'context menu windows 10')
        ]
      },
    ]
  },

  {
    id: 'update', icon: '🔄', title: 'Windows Update', sub: 'Status, available updates and history',
    sections: [
      { title: 'Status', items: [{ type: 'custom', id: 'wuinfo', label: 'Windows Update status version build restart required', kw: 'version build pending reboot', render: 'wuinfo' }] },
      { title: 'Install updates', items: [{ type: 'custom', id: 'wuinstall', label: 'Check for updates and install them download install progress', kw: 'upgrade patch search download install drivers restart', render: 'wuinstall' }] },
      { title: 'Pause updates', items: [{ type: 'custom', id: 'wupause', label: 'Pause Windows updates for days', kw: 'delay postpone stop updates', render: 'wupause' }] },
      { title: 'Recovery', items: [{ type: 'custom', id: 'recovery', label: 'Recovery advanced startup reset this PC safe mode', kw: 'reset restore safe mode troubleshoot boot', render: 'recovery' }] },
      { title: 'Update history', items: [{ type: 'custom', id: 'wuhistory', label: 'Update history installed KB failed', kw: 'kb patches installed', render: 'wuhistory' }] },
    ]
  },
  {
    id: 'backup', icon: '💾', title: 'Vorynth backup', sub: 'Updates, and saving or restoring your preferences',
    sections: [{ title: 'Full backup of your Vorynth data', items: [{ type: 'custom', id: 'databackup', label: 'Full backup export import everything notes planner journal data move to another pc encrypt password', kw: 'backup restore migrate transfer data export import', render: 'databackup' }] }, { title: 'Settings Time Machine', items: [{ type: 'custom', id: 'timemachine', label: 'Settings Time Machine snapshots history undo restore roll back compare what changed', kw: 'snapshot backup restore previous settings rollback history checkpoint', render: 'timemachine' }] }, { title: 'Update Vorynth', items: [{ type: 'custom', id: 'selfupdate', label: 'Update Vorynth check for updates new version install update app', kw: 'update upgrade version download newer', render: 'selfupdate' }] }, {
      title: 'Preferences', items: [
        { type: 'button', id: 'export', label: 'Export settings', desc: 'Saves every toggle in Vorynth Settings, plus accent and pinned items, to a JSON file',
          kw: 'backup save', btn: 'Export', run: 'export' },
        { type: 'button', id: 'restorepoint', label: 'Create a Windows restore point', desc: 'A safety net before big changes. Windows asks for administrator permission and allows one per 24 hours.',
          kw: 'system restore undo safe checkpoint', btn: 'Create', run: async () => { await call('restorePoint'); return 'Restore point requested'; } },
        { type: 'button', id: 'import', label: 'Import settings', desc: 'Applies a previously exported file', kw: 'restore load', btn: 'Import', run: 'import' }
      ]
    }]
  }
];

PAGES.splice(1, 0, {
  id: 'profiles', icon: '⚡', title: 'Profiles', sub: 'Switch your whole PC setup in one click',
  sections: [
    { title: 'Profiles', items: [{ type: 'custom', id: 'profiles', label: 'Profiles gaming focus battery saver presentation night owl modes', kw: 'preset mode scene', render: 'profiles' }] },
    { title: 'Focus timer', items: [{ type: 'custom', id: 'focustimer', label: 'Focus timer pomodoro', kw: 'pomodoro study work mute', render: 'focustimer' }] }
  ]
});
PAGES.splice(PAGES.findIndex((p) => p.id === 'update'), 0, {
  id: 'toolbox', icon: '🧰', title: 'Toolbox', sub: 'Tools Windows never gave you',
  sections: [
    { title: 'Process manager', items: [{ type: 'custom', id: 'processes', label: 'Process manager top memory apps end task kill', kw: 'task manager ram', render: 'processes' }] },
    { title: 'Network tools', items: [
      { type: 'custom', id: 'pingmon', label: 'Ping monitor latency lag', kw: 'network internet latency jitter packet loss', render: 'pingmon' },
      { type: 'custom', id: 'dnsbench', label: 'DNS speed benchmark fastest dns', kw: 'cloudflare google quad9 resolver speed', render: 'dnsbench' }
    ] },
    { title: 'Duplicate finder', items: [{ type: 'custom', id: 'dupes', label: 'Duplicate file finder same files copies wasted space', kw: 'duplicates identical copies clean photos', render: 'dupes' }] },
    { title: 'Downloads organizer', items: [{ type: 'custom', id: 'organizer', label: 'Downloads organizer sort files into folders undo', kw: 'tidy clean messy downloads folder', render: 'organizer' }] },
    { title: 'Disk analyzer', items: [{ type: 'custom', id: 'diskanalyzer', label: 'Disk analyzer big files biggest folders find large files space hog', kw: 'storage space what is taking space delete large', render: 'diskanalyzer' }] },
    { title: 'Environment variables', items: [{ type: 'custom', id: 'envvars', label: 'Environment variables user editor', kw: 'env java python home developer', render: 'envvars' }] },
    { title: 'Password generator', items: [{ type: 'custom', id: 'passgen', label: 'Password generator random strong', kw: 'secure generate', render: 'passgen' }] },
    { title: 'Cleanup center', items: [
      { type: 'custom', id: 'cleanup', label: 'Cleanup center temp files recycle bin', kw: 'free space junk empty', render: 'cleanup' },
      { type: 'custom', id: 'autoclean', label: 'Automatic weekly cleanup schedule temp files', kw: 'maintenance schedule auto', render: 'autoclean' }
    ] },
    { title: 'Disk health', items: [{ type: 'custom', id: 'diskhealth', label: 'Disk health SSD HDD status', kw: 'smart drive failing', render: 'diskhealth' }] }
  ]
});

/* ---------- more pages ---------- */
PAGES.push(
  {
    id: 'devices', icon: '🖱️', title: 'Bluetooth & devices', sub: 'Everything plugged in or paired',
    sections: [
      { title: 'Connected', items: [{ type: 'custom', id: 'devicelist', label: 'Connected devices mouse keyboard monitor camera printer bluetooth speakers headphones', kw: 'usb paired audio', render: 'devicelist' }] },
      { title: 'Mouse', items: [{ type: 'custom', id: 'mouse', label: 'Mouse pointer speed scroll lines swap buttons', kw: 'cursor sensitivity dpi left handed wheel', render: 'mouse' }] },
      { title: 'Bluetooth and Wi-Fi radios', items: [{ type: 'custom', id: 'radios', label: 'Bluetooth and Wi-Fi radio switches turn on off airplane', kw: 'bluetooth wireless airplane mode radio', render: 'radios' }] },
      { title: 'Printers', items: [{ type: 'custom', id: 'printers', label: 'Printers default printer', kw: 'print scanner', render: 'printers' }] },
      { title: 'Problems and AutoPlay', items: [{ type: 'custom', id: 'deviceproblems', label: 'Devices with problems driver errors device manager', kw: 'driver missing yellow warning broken hardware', render: 'deviceproblems' }, toggle('autoplay', 'AutoPlay', 'Offer to open or play when you plug in a drive, phone or camera', 'usb flash drive memory card')] },
    ]
  },
  {
    id: 'notifications', icon: '🔔', title: 'Notifications', sub: 'Quiet your PC down',
    sections: [
      { title: 'Notifications', items: [
        toggle('notifications', 'Notifications', 'Turn off to silence every app (a simple Do Not Disturb)', 'toast banner dnd quiet focus'),
        toggle('notifSound', 'Notification sounds', 'Allow notifications to play a sound', 'beep'),
        toggle('notifLock', 'Show notifications on the lock screen', '', 'privacy')
      ] },
    ]
  },
  {
    id: 'access', icon: '♿', title: 'Accessibility', sub: 'Make Windows easier to see and use',
    sections: [
      { title: 'Display', items: [
        { type: 'slider', id: 'textscale', label: 'Text size', desc: 'Sign out and back in to apply everywhere', kw: 'font bigger larger zoom readable', min: 100, max: 225, unit: '%',
          load: () => call('textScaleGet'), save: (v) => call('textScaleSet', { value: v }) },
        toggle('scrollbars', 'Always show scroll bars', 'Stops them hiding until you scroll', 'scrollbar'),
        
        
      ] },
      { title: 'Keyboard shortcuts', items: [
        toggle('stickyKeys', 'Sticky Keys shortcut', 'Press Shift five times to turn on Sticky Keys', 'shift popup annoying'),
        toggle('filterKeys', 'Filter Keys shortcut', 'Hold right Shift for eight seconds', 'popup'),
        toggle('toggleKeys', 'Toggle Keys shortcut', 'Hold Num Lock for five seconds', 'popup beep')
      ] },
      { title: 'Read aloud', items: [{ type: 'custom', id: 'readaloud', label: 'Read aloud text to speech narrator screen reader speak', kw: 'narrator tts voice speak listen clipboard', render: 'readaloud' }] }
    ]
  },
  {
    id: 'time', icon: '🕒', title: 'Time & language', sub: 'Clock, time zone and region',
    sections: [
      { title: 'Now', items: [{ type: 'custom', id: 'timeinfo', label: 'Current time zone language region', kw: 'clock culture', render: 'timeinfo' }] },
      { title: 'Clock', items: [
        toggle('hour24', '24-hour clock', 'Show 18:30 instead of 6:30 PM', 'time format military'),
        { type: 'seg', id: 'firstday', label: 'First day of the week', desc: 'Used by calendars', kw: 'saturday sunday monday week start',
          options: [['5', 'Saturday'], ['6', 'Sunday'], ['0', 'Monday']], load: () => call('firstDayGet'), save: (v) => call('firstDaySet', { value: v }) }
      ] },
      { title: 'Time zone', items: [
        { type: 'custom', id: 'timezone', label: 'Change time zone', kw: 'riyadh dubai utc gmt', render: 'timezone' },
        { type: 'button', id: 'timesync', label: 'Sync clock now', desc: 'Asks the internet time server. Windows will ask for administrator permission.', kw: 'ntp wrong time', btn: 'Sync',
          run: async () => { await call('timeSync'); return 'Clock sync requested'; } }
      ] },
    ]
  },
  {
    id: 'session', icon: '👤', title: 'Accounts & power', sub: 'Your account, plus lock, sleep, restart and shutdown',
    sections: [
      { title: 'Power', items: [{ type: 'custom', id: 'poweractions', label: 'Lock sign out sleep hibernate restart shut down timer schedule', kw: 'power off shutdown restart timer later', render: 'poweractions' }] },
      { title: 'Your account', items: [{ type: 'custom', id: 'accountinfo', label: 'Account username administrator computer name', kw: 'user profile admin', render: 'accountinfo' }] },
    ]
  }
);

PAGES.push({
  id: 'labs', icon: '✨', title: 'Labs', sub: 'Things Windows does not have',
  sections: [
    { title: 'Keep awake', items: [{ type: 'custom', id: 'keepawake', label: 'Keep awake prevent sleep screen stay on caffeine', kw: 'sleep downloads presentation never sleep awake', render: 'keepawake' }] },
    { title: 'Everything Windows does not give you', items: [{ type: 'custom', id: 'labsgrid', label: 'Labs launchpad features', kw: 'new features exclusive extras', render: 'labsgrid' }] }
  ]
});

PAGES.push({
  id: 'automation', icon: '🤖', title: 'Automation', sub: 'Let Vorynth do things for you, automatically',
  sections: [
    { title: 'Run in the background', items: [{ type: 'custom', id: 'bgsettings', label: 'Background tray start with Windows hotkeys notifications pause automation', kw: 'startup autostart tray background shortcuts', render: 'bgsettings' }] },
    { title: 'Rules', items: [{ type: 'custom', id: 'rules', label: 'Automation rules when unplug battery wifi app time then do', kw: 'automatic trigger if this then that schedule profile', render: 'rules' }] },
    { title: 'Settings guard', items: [{ type: 'custom', id: 'guard', label: 'Settings guard keep settings from changing back protect', kw: 'windows update resets privacy settings revert enforce', render: 'guard' }] },
    { title: 'Activity', items: [{ type: 'custom', id: 'activity', label: 'Automation activity log history', render: 'activity' }] }
  ]
});

PAGES.push({
  id: 'wintools', icon: '🧩', title: 'Windows tools', sub: 'Vorynth versions of Task Manager, Services, Event Viewer, Win+V and more',
  sections: [
    { title: 'Services', items: [{ type: 'custom', id: 'services', label: 'Services manager start stop restart startup type', kw: 'services.msc windows service background', render: 'services' }] },
    { title: 'Event log', items: [{ type: 'custom', id: 'events', label: 'Event viewer errors warnings crashes why did windows crash', kw: 'event viewer logs blue screen problems errors', render: 'events' }] },
    { title: 'Clipboard history', items: [{ type: 'custom', id: 'clipboard', label: 'Clipboard history Win+V copied items pin', kw: 'copy paste history win v', render: 'clipboard' }] },
    { title: 'Quick notes', items: [{ type: 'custom', id: 'notes', label: 'Quick notes sticky notes', kw: 'sticky notes memo text', render: 'notes' }] },
    { title: 'System report', items: [{ type: 'button', id: 'report', label: 'Save a full PC report', desc: 'Hardware, storage, battery, updates, startup apps and device problems in one web page you can keep or send', kw: 'system information msinfo specs export share', btn: 'Create report', run: async () => { const f = await call('systemReport'); return f ? 'Saved to ' + f : 'Cancelled'; } }] },
    { title: 'Other built-in tools', items: [
      { type: 'button', id: 'alt-taskmgr', label: 'Task Manager', desc: 'Vorynth version: Toolbox > Process manager', btn: 'Go', run: () => { go('toolbox', 'processes'); return 'Opened Toolbox'; } },
      { type: 'button', id: 'alt-startup', label: 'Startup apps (msconfig)', desc: 'Vorynth version: Apps > Startup', btn: 'Go', run: () => { go('apps', 'startupmgr'); return 'Opened Apps'; } },
      { type: 'button', id: 'alt-cleanup', label: 'Disk Cleanup', desc: 'Vorynth version: Toolbox > Cleanup center', btn: 'Go', run: () => { go('toolbox', 'cleanup'); return 'Opened Toolbox'; } },
      { type: 'button', id: 'alt-sched', label: 'Task Scheduler (Vorynth rules)', desc: 'Vorynth version: Automation > Rules', btn: 'Go', run: () => { go('automation', 'rules'); return 'Opened Automation'; } },
      { type: 'button', id: 'alt-diskmgmt', label: 'Disk Management', desc: 'Vorynth version: System > Disks and partitions', btn: 'Go', run: () => { go('system', 'disks'); return 'Opened System'; } },
      { type: 'button', id: 'alt-notepad', label: 'Notepad', desc: 'Vorynth version: Pad', btn: 'Go', run: () => { go('aurora-apps', 'pad'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-calculator', label: 'Calculator', desc: 'Vorynth version: Calc', btn: 'Go', run: () => { go('aurora-apps', 'calc'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-paint', label: 'Paint', desc: 'Vorynth version: Sketch', btn: 'Go', run: () => { go('aurora-apps', 'sketch'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-clock', label: 'Clock and alarms', desc: 'Vorynth version: Timer and stopwatch', btn: 'Go', run: () => { go('aurora-apps', 'timer'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-calendar', label: 'Calendar', desc: 'Vorynth version: Planner', btn: 'Go', run: () => { go('aurora-apps', 'planner'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-voicerec', label: 'Voice Recorder', desc: 'Vorynth version: Recorder', btn: 'Go', run: () => { go('aurora-apps', 'recorder'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-photos', label: 'Photos and Media Player', desc: 'Vorynth version: Viewer', btn: 'Go', run: () => { go('aurora-apps', 'viewer'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-charmap', label: 'Character Map', desc: 'Vorynth version: Symbols', btn: 'Go', run: () => { go('aurora-apps', 'symbols'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-snip', label: 'Snipping Tool', desc: 'Vorynth version: Snap', btn: 'Go', run: () => { go('aurora-apps', 'snap'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-camera', label: 'Camera', desc: 'Vorynth version: Cam', btn: 'Go', run: () => { go('aurora-apps', 'cam'); return 'Opened Vorynth Apps'; } },
      { type: 'button', id: 'alt-store', label: 'Microsoft Store', desc: 'Vorynth version: Vorynth Store (install apps with one click)', btn: 'Go', run: () => { go('store', 'appstore'); return 'Opened Vorynth Store'; } },
      { type: 'button', id: 'alt-programs', label: 'Control Panel: Programs', desc: 'Vorynth version: Apps > Installed (with Uninstall)', btn: 'Go', run: () => { go('apps', 'applist'); return 'Opened Apps'; } },
      { type: 'button', id: 'alt-devmgmt', label: 'Device Manager', desc: 'Vorynth version: Bluetooth & devices', btn: 'Go', run: () => { go('devices', 'deviceproblems'); return 'Opened Devices'; } }
    ] }
  ]
});

PAGES.push({
  id: 'store', icon: '🛍️', title: 'Vorynth Store', sub: 'Install apps safely, no website hunting',
  sections: [{ title: 'Apps', items: [{ type: 'custom', id: 'appstore', label: 'Vorynth Store install apps download browser firefox chrome vlc 7zip steam update uninstall', kw: 'store app installer winget microsoft store alternative download software', render: 'appstore' }] }]
});

PAGES.push({
  id: 'aurora-apps', icon: '🧰', title: 'Vorynth Apps', sub: 'Your own Notepad, Calculator, Paint, Screenshots, Camera, Journal and more',
  sections: [
    { title: 'Pad: text editor', items: [{ type: 'custom', id: 'pad', label: 'Pad text editor notepad write edit text file', kw: 'notepad txt editor', render: 'pad' }] },
    { title: 'Calc: calculator and converter', items: [{ type: 'custom', id: 'calc', label: 'Calc calculator scientific unit converter', kw: 'calculator math convert length weight temperature', render: 'calc' }] },
    { title: 'Sketch: drawing', items: [{ type: 'custom', id: 'sketch', label: 'Sketch drawing paint canvas pen brush', kw: 'paint draw image edit', render: 'sketch' }] },
    { title: 'Timer and stopwatch', items: [{ type: 'custom', id: 'timer', label: 'Timer stopwatch alarm clock countdown', kw: 'clock alarm countdown', render: 'timer' }] },
    { title: 'Planner: calendar and to-do', items: [{ type: 'custom', id: 'planner', label: 'Planner calendar to-do tasks events', kw: 'calendar todo tasks agenda', render: 'planner' }] },
    { title: 'Recorder', items: [{ type: 'custom', id: 'recorder', label: 'Recorder voice recorder microphone audio', kw: 'voice sound record', render: 'recorder' }] },
    { title: 'Viewer: photos, music and video', items: [{ type: 'custom', id: 'viewer', label: 'Viewer photos pictures music video media player slideshow', kw: 'photos gallery media player', render: 'viewer' }] },
    { title: 'Snap: screenshots', items: [{ type: 'custom', id: 'snap', label: 'Snap screenshot snipping tool capture screen crop', kw: 'snipping tool print screen capture', render: 'snap' }] },
    { title: 'Cam: camera', items: [{ type: 'custom', id: 'cam', label: 'Cam camera webcam photo video record', kw: 'camera webcam selfie', render: 'cam' }] },
    { title: 'QR codes', items: [{ type: 'custom', id: 'qr', label: 'QR code generator link text make', kw: 'qr barcode share link', render: 'qr' }] },
    { title: 'Dates: calculators', items: [{ type: 'custom', id: 'dates', label: 'Dates calculator days between age countdown add days birthday', kw: 'date difference age birthday countdown', render: 'dates' }] },
    { title: 'Dev kit', items: [{ type: 'custom', id: 'devkit', label: 'Dev kit json formatter base64 url encode hash sha256 uuid regex tester color converter timestamp text tools', kw: 'developer tools json hash regex uuid color contrast unix time case sort lines', render: 'devkit' }] },
    { title: 'Focus: pomodoro timer', items: [{ type: 'custom', id: 'focus', label: 'Focus pomodoro timer work break study concentrate', kw: 'pomodoro study productivity', render: 'focus' }] },
    { title: 'Journal', items: [{ type: 'custom', id: 'journal', label: 'Journal diary daily entries mood write', kw: 'diary notes day mood', render: 'journal' }] },
    { title: 'Habits', items: [{ type: 'custom', id: 'habits', label: 'Habits tracker streak daily routine', kw: 'habit streak routine goals', render: 'habits' }] },
    { title: 'Ledger: expenses', items: [{ type: 'custom', id: 'ledger', label: 'Ledger expense tracker budget money spending income csv', kw: 'expenses budget spending money finance', render: 'ledger' }] },
    { title: 'Pix: resize and convert pictures', items: [{ type: 'custom', id: 'pix', label: 'Pix resize convert compress pictures images jpg png webp rotate batch', kw: 'image resize compress photo convert', render: 'pix' }] },
    { title: 'Rename: bulk file renamer', items: [{ type: 'custom', id: 'rename', label: 'Rename bulk file renamer batch names numbering', kw: 'rename files batch powertoys', render: 'rename' }] },
    { title: 'Symbols', items: [{ type: 'custom', id: 'symbols', label: 'Symbols character map emoji special characters', kw: 'character map emoji unicode', render: 'symbols' }] }
  ]
});

{ const pz = PAGES.find((x) => x.id === 'personalization'); if (pz) pz.sections.splice(1, 0, { title: 'Vorynth-only settings', items: [{ type: 'custom', id: 'auroraprefs', label: 'Vorynth-only settings start page compact sidebar text size density corners glass sounds right to left hide pages message position confirm commands', kw: 'preferences interface layout ui behaviour customise', render: 'auroraprefs' }] }); if (pz) pz.sections.unshift({ title: 'Vorynth Studio', items: [{ type: 'custom', id: 'studio', label: 'Vorynth Studio themes packs neon gold borealis effects background animation spotlight intro', kw: 'theme look style appearance animation particles stars aurora background', render: 'studio' }] }); }

PAGES.push({
  id: 'aurora-plus', icon: '💎', title: 'Vorynth Plus', sub: '40 extra tools: organise, calculate, write, create, play',
  sections: [
    { title: 'Organize: Boards', items: [{ type: 'custom', id: 'kanban', label: 'Boards kanban to do doing done cards tasks', kw: 'kanban trello project', render: 'kanban' }] },
    { title: 'Organize: Snippets', items: [{ type: 'custom', id: 'snippets', label: 'Snippets saved text copy paste replies templates', kw: 'text templates canned responses', render: 'snippets' }] },
    { title: 'Organize: Countdowns', items: [{ type: 'custom', id: 'countdowns', label: 'Countdowns events days until trip exam birthday', kw: 'days left event', render: 'countdowns' }] },
    { title: 'Organize: Goals', items: [{ type: 'custom', id: 'goals', label: 'Goals progress target savings tracker', kw: 'target progress savings', render: 'goals' }] },
    { title: 'Organize: Time tracker', items: [{ type: 'custom', id: 'timelog', label: 'Time tracker hours work log timesheet', kw: 'timesheet hours billable', render: 'timelog' }] },
    { title: 'Organize: Lists', items: [{ type: 'custom', id: 'lists', label: 'Lists reading watch games books movies series backlog', kw: 'books movies watchlist', render: 'lists' }] },
    { title: 'Organize: Reminders', items: [{ type: 'custom', id: 'reminders', label: 'Reminders notify daily alert time', kw: 'alarm notification remind', render: 'reminders' }] },
    { title: 'Organize: Sticky wall', items: [{ type: 'custom', id: 'stickies', label: 'Sticky wall notes drag colours', kw: 'sticky notes board', render: 'stickies' }] },
    { title: 'Organize: Water tracker', items: [{ type: 'custom', id: 'water', label: 'Water tracker drink hydration glasses goal', kw: 'hydration drink', render: 'water' }] },
    { title: 'Organize: Flashcards', items: [{ type: 'custom', id: 'cards', label: 'Flashcards study spaced repetition decks learn', kw: 'study memorize leitner', render: 'cards' }] },
    { title: 'Calculators and converters: Loan calculator', items: [{ type: 'custom', id: 'loan', label: 'Loan calculator mortgage monthly payment interest', kw: 'mortgage payment interest', render: 'loan' }] },
    { title: 'Calculators and converters: Savings and compound interest', items: [{ type: 'custom', id: 'compound', label: 'Compound interest savings investment growth calculator', kw: 'invest growth return', render: 'compound' }] },
    { title: 'Calculators and converters: Tip and split the bill', items: [{ type: 'custom', id: 'tip', label: 'Tip split bill restaurant calculator', kw: 'restaurant bill', render: 'tip' }] },
    { title: 'Calculators and converters: Percent and discount', items: [{ type: 'custom', id: 'percent', label: 'Percent percentage discount vat tax calculator change', kw: 'sale discount vat', render: 'percent' }] },
    { title: 'Calculators and converters: Health calculators', items: [{ type: 'custom', id: 'health', label: 'Health BMI BMR calories water calculator', kw: 'bmi calories', render: 'health' }] },
    { title: 'Calculators and converters: Number bases', items: [{ type: 'custom', id: 'bases', label: 'Number bases binary hex octal decimal converter', kw: 'binary hexadecimal', render: 'bases' }] },
    { title: 'Calculators and converters: Number to words and Roman numerals', items: [{ type: 'custom', id: 'words', label: 'Number to words roman numerals eastern arabic digits', kw: 'roman numerals spell number', render: 'words' }] },
    { title: 'Calculators and converters: Hijri date converter', items: [{ type: 'custom', id: 'hijri', label: 'Hijri converter islamic calendar umm al-qura gregorian', kw: 'islamic calendar', render: 'hijri' }] },
    { title: 'Calculators and converters: Meeting planner', items: [{ type: 'custom', id: 'meeting', label: 'Meeting planner time zones world overlap schedule', kw: 'time zone overlap', render: 'meeting' }] },
    { title: 'Calculators and converters: Trip and fuel cost', items: [{ type: 'custom', id: 'fuel', label: 'Trip fuel cost distance consumption calculator', kw: 'petrol gas road trip', render: 'fuel' }] },
    { title: 'Writing: Writer toolkit', items: [{ type: 'custom', id: 'writer', label: 'Writer toolkit word count readability reading time frequency', kw: 'word count flesch', render: 'writer' }] },
    { title: 'Writing: Lorem ipsum generator', items: [{ type: 'custom', id: 'lorem', label: 'Lorem ipsum placeholder text generator', kw: 'dummy text', render: 'lorem' }] },
    { title: 'Writing: Arabic text tools', items: [{ type: 'custom', id: 'arabic', label: 'Arabic text tools tashkeel diacritics digits normalise', kw: 'عربي تشكيل ارقام', render: 'arabic' }] },
    { title: 'Writing: Ciphers and codes', items: [{ type: 'custom', id: 'ciphers', label: 'Ciphers caesar rot13 morse nato code', kw: 'morse caesar', render: 'ciphers' }] },
    { title: 'Writing: Password strength and passphrases', items: [{ type: 'custom', id: 'pwcheck', label: 'Password strength checker passphrase generator entropy', kw: 'password security', render: 'pwcheck' }] },
    { title: 'Creative: Colour palette generator', items: [{ type: 'custom', id: 'palette', label: 'Colour palette generator harmony complementary triadic', kw: 'color scheme', render: 'palette' }] },
    { title: 'Creative: CSS lab', items: [{ type: 'custom', id: 'csslab', label: 'CSS lab gradient box shadow border radius generator', kw: 'gradient shadow', render: 'csslab' }] },
    { title: 'Creative: Colours from a picture', items: [{ type: 'custom', id: 'imgcolor', label: 'Image colour picker eyedropper dominant palette', kw: 'eyedropper', render: 'imgcolor' }] },
    { title: 'Creative: Image to Base64', items: [{ type: 'custom', id: 'imgb64', label: 'Image base64 data url converter', kw: 'data uri', render: 'imgb64' }] },
    { title: 'Creative: Ambience sounds', items: [{ type: 'custom', id: 'ambience', label: 'Ambience noise white pink brown rain focus sleep sounds', kw: 'white noise focus sleep', render: 'ambience' }] },
    { title: 'Creative: Metronome and tone', items: [{ type: 'custom', id: 'metronome', label: 'Metronome tone generator bpm frequency', kw: 'music tempo', render: 'metronome' }] },
    { title: 'Creative: Big clock', items: [{ type: 'custom', id: 'bigclock', label: 'Big clock full screen time display', kw: 'clock fullscreen', render: 'bigclock' }] },
    { title: 'Games: Snake', items: [{ type: 'custom', id: 'snake', label: 'Snake game arcade', kw: 'game arcade', render: 'snake' }] },
    { title: 'Games: 2048', items: [{ type: 'custom', id: 'game2048', label: '2048 puzzle game', kw: 'puzzle game', render: 'game2048' }] },
    { title: 'Games: Memory match', items: [{ type: 'custom', id: 'memory', label: 'Memory match game cards pairs', kw: 'pairs game', render: 'memory' }] },
    { title: 'Games: Typing test', items: [{ type: 'custom', id: 'typing', label: 'Typing speed test wpm', kw: 'wpm keyboard', render: 'typing' }] },
    { title: 'Games: Dice, coin and picker', items: [{ type: 'custom', id: 'randoms', label: 'Random dice coin picker teams shuffle decision', kw: 'decide random', render: 'randoms' }] },
    { title: 'Files: File fingerprint', items: [{ type: 'custom', id: 'fingerprint', label: 'File fingerprint checksum sha256 hash verify download', kw: 'hash verify', render: 'fingerprint' }] },
    { title: 'Files: CSV viewer', items: [{ type: 'custom', id: 'csvview', label: 'CSV viewer table sort search tsv spreadsheet', kw: 'spreadsheet table', render: 'csvview' }] },
    { title: 'Files: JSON and CSV converter', items: [{ type: 'custom', id: 'jsoncsv', label: 'JSON CSV converter', kw: 'convert data', render: 'jsoncsv' }] }
  ]
});

PAGES.push({
  id: 'aurora-pro', icon: '🛠️', title: 'Vorynth Toolkit', sub: 'PC doctor, Wi-Fi file drop, network kit, PDF, zip, QR, encrypted vault',
  sections: [
    { title: 'PC Doctor', items: [{ type: 'custom', id: 'doctor', label: 'PC Doctor health check why is my pc slow memory disk startup devices advice', kw: 'slow lag problems performance check', render: 'doctor' }] },
    { title: 'Lock a file with a password', items: [{ type: 'custom', id: 'filelock', label: 'Lock encrypt decrypt unlock file password protect aur', kw: 'encrypt decrypt lock file password secure aur end to end', render: 'filelock' }] },
    { title: 'Drop: share a file over Wi-Fi', items: [{ type: 'custom', id: 'drop', label: 'Drop share send file phone wifi qr local network no cables', kw: 'airdrop nearby share transfer', render: 'drop' }] },
    { title: 'Network kit', items: [{ type: 'custom', id: 'netkit', label: 'Network kit dns lookup port check ssl certificate headers redirect public ip wake on lan', kw: 'dns ping port ssl whois', render: 'netkit' }] },
    { title: 'PDF tools', items: [{ type: 'custom', id: 'pdf', label: 'PDF tools merge join split extract pages rotate', kw: 'pdf combine', render: 'pdf' }] },
    { title: 'Zip files', items: [{ type: 'custom', id: 'zip', label: 'Zip archive create extract unpack compress folder', kw: 'archive compress', render: 'zip' }] },
    { title: 'QR scanner', items: [{ type: 'custom', id: 'qrscan', label: 'QR scanner read qr code from picture screenshot screen', kw: 'scan barcode', render: 'qrscan' }] },
    { title: 'Disk speed test', items: [{ type: 'custom', id: 'diskspeed', label: 'Disk speed test ssd hdd read write benchmark', kw: 'benchmark drive', render: 'diskspeed' }] },
    { title: 'Vault: encrypted notes', items: [{ type: 'custom', id: 'vault', label: 'Vault encrypted private notes password secrets aes', kw: 'secure notes encrypt', render: 'vault' }] }
  ]
});

PAGES.push({
  id: 'addons', icon: '🧩', title: 'Add-ons', sub: 'Small tools for Vorynth, made by you or others',
  sections: [{ title: 'Add-ons', items: [{ type: 'custom', id: 'addons', label: 'Add-ons plugins extensions install make your own custom tools sandbox', kw: 'plugin extension addon install create custom widget tool', render: 'addons' }] }]
});

PAGES.push({
  id: 'oscustomize', icon: '🎛️', title: 'Customize OS', sub: 'Fonts, windows, desktop, files, keyboard, power, notifications. Every setting can be reset',
  sections: [{ title: 'Customize OS', items: [{ type: 'custom', id: 'oscustomize', label: 'customize everything fonts text size theme icons pointer windows desktop icons files keyboard repeat double click sound power lid screen off notifications reset', kw: 'font dpi theme icons cursor window shadow transparency focus workspaces desktop thunar keyboard repeat double click sound power lid sleep notifications do not disturb reset', render: 'oscustomize' }] }]
});

PAGES.push({
  id: 'desklook', icon: '🍏', title: 'Desktop Look', sub: 'Make Vorynth OS look and feel like a Mac. Dock, menu bar, colours, hot corners',
  sections: [{ title: 'Desktop Look', items: [{ type: 'custom', id: 'desklook', label: 'desktop look macos mac dock menu bar theme dark light accent wallpaper hot corners night shift blur', kw: 'macos dock menubar theme dark accent wallpaper hot corners night shift blur spotlight control center', render: 'desklook' }] }]
});

PAGES.push({
  id: 'space', icon: '🔎', title: 'Space Finder', sub: 'Find what is using your disk (read-only)',
  sections: [{ title: 'Space Finder', items: [{ type: 'custom', id: 'space', label: 'Space Finder disk space biggest files folders duplicates large cleanup storage', kw: 'disk space large files folders duplicate duplicates storage full', render: 'space' }] }]
});



PAGES.push({
  id: 'utils', icon: '🧮', title: 'Vorynth Utilities', sub: 'File checker, folder compare, checksum lists',
  sections: [{ title: 'Utilities', items: [{ type: 'custom', id: 'utils', label: 'Utilities file checker checksum hash sha256 folder compare empty folders checksum list', kw: 'hash checksum verify download compare folders empty folders', render: 'utils' }] }]
});

PAGES.push({
  id: 'journey', icon: '🏆', title: 'Vorynth Journey', sub: 'Levels, streaks, achievements and unlockable accents',
  sections: [{ title: 'Journey', items: [{ type: 'custom', id: 'journey', label: 'Journey level xp streak achievements quests rewards unlock accent colors game', kw: 'level xp streak achievement quest reward unlock accent game progress', render: 'journey' }] }]
});
PAGES.push({
  id: 'aurora-os', icon: '💿', title: 'Vorynth OS', sub: 'Download, check and install Vorynth OS',
  sections: [{ title: 'Vorynth OS', items: [{ type: 'custom', id: 'os', label: 'Vorynth OS install download image iso usb ventoy rufus linux boot check verify join parts', kw: 'aurora os linux iso image usb boot install download verify join', render: 'os' }] }]
});

PAGES.push({
  id: 'mods', icon: '🛠️', title: 'Vorynth Mods', sub: 'Small tweaks for taskbar, Explorer and Start. All reversible',
  sections: [
    { title: 'Taskbar', items: [
      toggle('taskbarEndTask', 'End task in taskbar menu', 'Right-click an app on the taskbar and choose End task (Windows 11)', 'kill close frozen app developer'),
      toggle('taskbarNeverCombine', 'Never combine taskbar buttons', 'Show every window as its own button with its name', 'combine group labels'),
      toggle('taskbarDesktopBtn', 'Show desktop button', 'The thin button at the far right corner of the taskbar', 'show desktop corner'),
      toggle('taskbarBadges', 'Taskbar badges', 'Little numbers and dots on taskbar icons', 'badge notification count'),
      toggle('taskbarAnimations', 'Taskbar animations', 'Turn off for a snappier, calmer taskbar', 'animation speed'),
      toggle('copilotButton', 'Copilot button', 'Show the Copilot button on the taskbar (some Windows 11 builds)', 'copilot ai button')
    ] },
    { title: 'File Explorer', items: [
      toggle('openThisPC', 'Open Explorer on This PC', 'Instead of Home / Quick access', 'launch start this pc home'),
      toggle('checkboxes', 'Tick boxes to select files', 'Easier multi-select with the mouse or touch', 'checkbox select'),
      toggle('compactView', 'Compact spacing', 'Fit more files on screen (Windows 11)', 'compact dense spacing'),
      toggle('superHidden', 'Show protected system files', 'Also shows hidden operating system files. Be careful', 'super hidden system files'),
      toggle('fullPathTitle', 'Full path in the title bar', 'See exactly which folder you are in', 'path title bar'),
      toggle('separateProcess', 'Open folders in separate processes', 'More stable, uses a little more memory', 'separate process stability'),
      toggle('navPaneExpand', 'Expand to the current folder', 'The left folder tree opens up to where you are', 'navigation pane expand tree'),
      toggle('navPaneAll', 'Show all folders in the tree', 'Includes Control Panel and Recycle Bin in the left tree', 'navigation pane all folders'),
      toggle('mergeConflicts', 'Show folder merge conflicts', 'See conflicts when copying folders with the same name', 'merge conflicts'),
      toggle('iconsOnly', 'Icons instead of thumbnails', 'Faster folders with lots of pictures', 'thumbnails icons only'),
      toggle('iconShadow', 'Shadow under icon names', 'The soft shadow behind desktop icon labels', 'icon label shadow'),
      toggle('infoTips', 'Info tips on hover', 'Small pop-up details when you hover over files', 'tooltip info tip hover'),
      toggle('showRecent', 'Recent and frequent files', 'Show recent files and frequent folders in Explorer', 'recent frequent quick access')
    ] },
    { title: 'Start, search and desktop', items: [
      toggle('startRecs', 'Start recommendations', 'The Recommended section in the Start menu (Windows 11)', 'start recommended'),
      toggle('webSearch', 'Web results in search', 'Show web suggestions when you search from the taskbar', 'web search bing suggestions'),
      toggle('startTrackDocs', 'Recent files in Start and jump lists', 'Turn off if you prefer to keep your recent files private', 'recent documents jump list start history'),
      toggle('startTrackProgs', 'Most-used apps in Start', 'Tracks the apps you open most to show them first', 'frequent apps start tracking'),
      toggle('chatButton', 'Chat button on the taskbar', 'The Teams chat icon (older Windows 11 builds)', 'chat teams button'),
      toggle('desktopIcons', 'Desktop icons', 'Turn off for a perfectly clean desktop', 'desktop icons clean hide'),
      toggle('snapFlyout', 'Snap layouts popup', 'The layout picker when hovering the maximize button (Windows 11)', 'snap layouts maximize'),
      toggle('aeroShake', 'Shake to minimize', 'Shake a window to minimize all the others', 'aero shake minimize')
    ] }
  ]
});

PAGES.push({
  id: 'startmenu', icon: '🪟', title: 'Start & Taskbar', sub: 'Make Start and the taskbar feel like yours. Every change can be undone',
  sections: [
    { title: 'One-click looks', items: [
      { type: 'button', id: 'pre-clean', label: 'Clean Start', desc: 'More pinned apps, no recommendations, no tracking, no web results. Nothing is deleted', kw: 'clean minimal start preset', btn: 'Apply', run: async () => { await call('applyPreset', { name: 'startClean' }); go(currentPage); return 'Clean Start applied'; } },
      { type: 'button', id: 'pre-left', label: 'Classic left taskbar', desc: 'Start button and icons on the left, like Windows 10', kw: 'left align taskbar classic preset', btn: 'Apply', run: async () => { await call('applyPreset', { name: 'startLeft' }); go(currentPage); return 'Taskbar moved to the left'; } },
      { type: 'button', id: 'pre-default', label: 'Back to Windows defaults', desc: 'Puts every setting on this page back the way Windows ships it', kw: 'reset default restore start', btn: 'Restore', run: async () => { await call('applyPreset', { name: 'startDefault' }); go(currentPage); return 'Windows defaults restored'; } }
    ] },
    { title: 'Start menu layout', items: [
      { type: 'seg', id: 'startLayout', label: 'What Start shows more of', desc: 'More pinned apps, the default mix, or more recommendations', kw: 'start layout pins recommendations more', options: [['1', 'More pins'], ['0', 'Default'], ['2', 'More recommendations']], load: () => call('dwordGet', { id: 'startLayout' }), save: (v) => call('dwordSet', { id: 'startLayout', value: v }) },
      toggle('startRecs', 'Recommended section', 'Tips and suggested files below your pinned apps (Windows 11)', 'start recommended recommendations'),
      toggle('startTrackProgs', 'Most-used apps', 'Let Start learn which apps you open the most', 'frequent apps start tracking'),
      toggle('startTrackDocs', 'Recent files', 'Show recently opened files in Start and jump lists', 'recent documents start history'),
      toggle('startAcctNotif', 'Account notifications in Start', 'Messages about your Microsoft account, backup and offers', 'account notifications microsoft start'),
      toggle('webSearch', 'Web results when you search', 'Search the web from Start and the taskbar box', 'web search bing start')
    ] },
    { title: 'Taskbar', items: [
      toggle('taskbarCenter', 'Centre the icons', 'Off puts the Start button and icons on the left', 'taskbar alignment center left'),
      { type: 'seg', id: 'taskbarSize', label: 'Taskbar size', desc: 'Small gives you more screen. Large is easier to tap', kw: 'taskbar size small large', options: [['0', 'Small'], ['1', 'Medium'], ['2', 'Large']], load: () => call('dwordGet', { id: 'taskbarSize' }), save: (v) => call('dwordSet', { id: 'taskbarSize', value: v }) },
      { type: 'seg', id: 'searchMode', label: 'Search on the taskbar', desc: 'Hidden, an icon, a full box, or an icon with a label', kw: 'search box taskbar icon', options: [['0', 'Hidden'], ['1', 'Icon'], ['2', 'Box'], ['3', 'Icon + label']], load: () => call('dwordGet', { id: 'searchMode' }), save: (v) => call('dwordSet', { id: 'searchMode', value: v }) },
      { type: 'seg', id: 'taskbarMulti', label: 'Buttons on other screens', desc: 'Which apps appear on the taskbar of a second monitor', kw: 'multiple monitors taskbar buttons', options: [['0', 'All taskbars'], ['1', 'Main + where open'], ['2', 'Where open']], load: () => call('dwordGet', { id: 'taskbarMulti' }), save: (v) => call('dwordSet', { id: 'taskbarMulti', value: v }) },
      toggle('taskbarAllMon', 'Taskbar on every screen', 'Show the taskbar on all your monitors', 'multi monitor taskbar all displays'),
      toggle('taskView', 'Task View button', 'The button that shows all your open windows and desktops', 'task view desktops'),
      toggle('widgets', 'Widgets button', 'News and weather panel', 'widgets news weather'),
      toggle('chatButton', 'Chat button', 'The Teams chat icon (older Windows 11 builds)', 'chat teams'),
      toggle('taskbarDesktopBtn', 'Show desktop corner', 'The thin button at the far right', 'show desktop'),
      toggle('taskbarNeverCombine', 'Never combine buttons', 'Every window gets its own button with its name', 'combine labels')
    ] }
  ]
});

PAGES.push({
  id: 'ai', icon: '🧠', title: 'De-AI Windows', sub: 'Turn Windows AI (Copilot, Recall, Click to Do, Edge AI, AI search) off in one click, or back on whenever you like',
  sections: [
    { title: 'Your AI status', items: [{ type: 'custom', id: 'aibanner', label: 'AI features status opt in opt out off on privacy', kw: 'ai copilot recall opt in out privacy', render: 'aibanner' }] },
    { title: 'Windows AI features (ON = allowed)', items: [
      toggle('aiCopilot', 'Copilot', 'The Windows Copilot assistant. When ON, what you type and ask can be sent to Microsoft to answer you', 'copilot assistant ai chat microsoft'),
      toggle('copilotButton', 'Copilot button on the taskbar', 'Only the button. Hiding it does not change what Copilot is allowed to do', 'copilot button taskbar'),
      toggle('aiRecall', 'Recall and AI snapshots', 'Lets Windows save screenshots of your activity so you can search them later. Only on Copilot+ PCs. Switching this ON only removes the block; Windows still asks you to set it up', 'recall snapshots ai timeline screenshots'),
      toggle('aiEdge', 'AI sidebar in Edge', 'The Copilot side panel in the Edge browser', 'edge copilot sidebar ai browser'),
      toggle('aiClickToDo', 'Click to Do (AI actions on your screen)', 'The overlay that analyses what is on your screen to suggest actions. Only on Copilot+ PCs', 'click to do ai screen actions overlay'),
      toggle('webSearch', 'Web and AI-powered search results', 'Search suggestions that are fetched online while you type', 'bing web search ai suggestions'),
      toggle('aiMachine', 'AI in Paint and Notepad, and Recall for everyone on this PC', 'Cocreator, Generative fill and Image creator in Paint, Rewrite in Notepad, and a lock that stops Recall being switched on. Machine-wide, so Windows asks for permission once', 'paint cocreator generative fill image creator notepad rewrite ai recall block machine admin')
    ] },
    { title: 'Quick choice', items: [
      { type: 'button', id: 'ai-alloff', label: 'De-AI Windows: turn all AI features off', desc: 'The recommended default. One click, and every switch above goes off', kw: 'de-ai deai remove disable ai off all privacy copilot recall', btn: 'All off', run: async () => { await call('applyPreset', { name: 'aiAllOff' }); go(currentPage); return 'All AI features are off'; } },
      { type: 'button', id: 'ai-allon', label: 'Turn all AI features back on', desc: 'Allows every Windows AI feature again (Windows may still ask you to set some of them up)', kw: 'enable ai on all copilot recall re-enable allow', btn: 'All on', run: async () => { if (!confirm('Allow all Windows AI features again?')) return 'Nothing changed'; await call('applyPreset', { name: 'aiAllOn' }); go(currentPage); return 'All AI features are allowed again'; } }
    ] }
  ]
});

PAGES.push({
  id: 'msoff', icon: '🚫', title: 'Turn off Microsoft features', sub: 'Switch off Microsoft AI and the background features that use up your RAM and CPU, plus the ads, tips and tracking. Every switch can go back on',
  sections: [
    { title: 'Quick choice', items: [
      { type: 'button', id: 'ms-alloff', label: 'Turn off Microsoft extras: everything below', desc: 'Ads, tips, suggestions, widgets, web search, error reports, Edge promos. Telemetry is a separate switch because it needs permission', kw: 'microsoft disable deactivate remove ads tips bloat telemetry off all', btn: 'All off', run: async () => { await call('applyPreset', { name: 'msAllOff' }); go(currentPage); return 'Microsoft extras are off'; } },
      { type: 'button', id: 'ms-allon', label: 'Turn the Microsoft features back on', desc: 'Puts everything on this page back to how Windows ships', kw: 'microsoft enable restore default on all', btn: 'All on', run: async () => { if (!confirm('Turn the Microsoft features back on?')) return 'Nothing changed'; await call('applyPreset', { name: 'msAllOn' }); go(currentPage); return 'Microsoft features are back on'; } }
    ] },
    { title: 'Microsoft AI and background hogs (ON = running and using resources)', items: [
      toggle('aiCopilot', 'Copilot', 'Microsoft AI assistant that runs in the background and sends what you type online', 'copilot ai hog'),
      toggle('aiRecall', 'Recall and AI snapshots', 'Constantly takes screenshots and analyses them. Heavy on disk and CPU/NPU', 'recall ai snapshots hog'),
      toggle('aiClickToDo', 'Click to Do', 'AI that analyses your screen', 'click to do ai'),
      toggle('aiMachine', 'AI in Paint and Notepad (all users)', 'Cocreator, Generative fill and Rewrite. Needs one permission prompt', 'paint notepad ai cocreator rewrite'),
      toggle('aiEdge', 'AI sidebar in Edge', 'Copilot panel in Edge', 'edge ai sidebar'),
      toggle('widgets', 'Widgets', 'A background web-view process for news and weather', 'widgets background ram'),
      toggle('msEdgeBg', 'Edge startup boost and background running', 'Edge stays loaded in memory after you close it', 'edge background ram startup boost'),
      toggle('msBgApps', 'Let Microsoft Store apps run in the background', 'Many apps keep running and using RAM and battery when closed', 'background apps ram battery')
    ] },
    { title: 'Ads and tips (ON = Microsoft shows them)', items: [
      toggle('suggestions', 'Suggested apps and tips', 'Promoted apps and tips Windows shows you', 'suggestions tips promoted apps'),
      toggle('msLockSpot', 'Lock screen Spotlight and tips', 'Rotating pictures with fun facts and ads on the lock screen', 'lock screen spotlight ads'),
      toggle('msSettingsAds', 'Ads and suggestions in Settings', 'Suggested content shown inside Windows Settings', 'settings suggested content ads'),
      toggle('msOneDriveNag', 'OneDrive and Microsoft 365 nags in File Explorer', 'Banners that push you to sign in or buy storage', 'onedrive sync provider notifications explorer banner'),
      toggle('startRecs', 'Recommendations in Start', 'Recently added apps and recommended files on the Start menu', 'start recommendations'),
      toggle('adId', 'Advertising ID', 'Lets apps show you ads based on a number tied to you', 'advertising id ads'),
      toggle('tailored', 'Tailored experiences', 'Uses your diagnostic data to suggest things', 'tailored experiences')
    ] },
    { title: 'Taskbar and search', items: [
      toggle('widgets', 'Widgets (news and weather)', 'The news panel on the taskbar', 'widgets news'),
      toggle('chatButton', 'Chat / Teams button', 'The Teams chat button on the taskbar', 'teams chat button'),
      toggle('webSearch', 'Web results in search', 'Bing results while you search', 'bing web search'),
      toggle('msSearchHighlights', 'Search highlights', 'The daily pictures and trends in the search box', 'search highlights doodles')
    ] },
    { title: 'Privacy and data (ON = data is sent)', items: [
      toggle('msErrorReport', 'Windows Error Reporting', 'Sends crash reports to Microsoft', 'error reporting crash dumps'),
      toggle('msSpeechOnline', 'Online speech recognition', 'Voice clips are processed by Microsoft online', 'speech voice online'),
      toggle('msTypingLearn', 'Typing and inking personalization', 'Windows learns from what you type and write', 'typing inking personalization'),
      toggle('msLangOptOut', 'Websites can see your language list', 'Lets websites tailor content to your language list', 'language list websites'),
      toggle('msTelemetry', 'Diagnostic data (telemetry)', 'Stops the connected user experiences service and sets diagnostic data to the minimum. Needs Windows permission. Home and Pro editions still send a basic required level, which Windows does not let anyone remove', 'telemetry diagnostic data diagtrack')
    ] },
    { title: 'Microsoft Edge (ON = allowed)', items: [
      toggle('msEdgePromos', 'Edge promotions and shopping helper', 'Recommendations, shopping assistant and tracking of how you use Edge. Turning this off makes Edge say it is managed by your organization', 'edge promotions shopping recommendations'),
      toggle('msEdgeBg', 'Edge startup boost and background running', 'Edge keeps running in the background after you close it', 'edge startup boost background')
    ] }
  ]
});

PAGES.push({
  id: 'cursorfix', icon: '🖱️', title: 'Mouse pointer fix', sub: 'Pointer keeps disappearing? One click turns off the usual causes and reloads it',
  sections: [{ title: 'Fix a vanishing pointer', items: [{ type: 'custom', id: 'cursorfix', label: 'mouse pointer cursor disappears vanishes hidden missing fix', kw: 'mouse cursor disappearing invisible pointer trails driver usb', render: 'cursorfix' }] }]
});

PAGES.push({
  id: 'salah', icon: '🕌', title: 'Prayer times & Hijri', sub: "Prayer times for Saudi cities and the UAE, next prayer countdown and today's Hijri date",
  sections: [{ title: 'Prayer times & Hijri', items: [{ type: 'custom', id: 'salah', label: 'prayer times salah hijri date fajr maghrib isha adhan', kw: 'أوقات الصلاة التاريخ الهجري الأذان prayer times salah hijri date fajr maghrib isha adhan', render: 'salah' }] }]
});

PAGES.push({
  id: 'zakat', icon: '🧮', title: 'Zakat calculator', sub: "Work out your zakat on cash, gold, silver and shop stock",
  sections: [{ title: 'Zakat calculator', items: [{ type: 'custom', id: 'zakat', label: 'zakat nisab calculator gold', kw: 'زكاة نصاب حاسبة zakat nisab calculator gold', render: 'zakat' }] }]
});



PAGES.push({
  id: 'worldclock', icon: '🌍', title: 'World clock', sub: "See who is awake: suppliers in China, Dubai, Turkey and more",
  sections: [{ title: 'World clock', items: [{ type: 'custom', id: 'worldclock', label: 'world clock time zones suppliers meeting', kw: 'ساعة عالمية world clock time zones suppliers meeting', render: 'worldclock' }] }]
});

PAGES.push({
  id: 'picker', icon: '🎨', title: 'Colour picker', sub: "Pick any colour on your screen and copy it as HEX, RGB or HSL",
  sections: [{ title: 'Colour picker', items: [{ type: 'custom', id: 'picker', label: 'color colour picker eyedropper hex rgb', kw: 'قطارة ألوان color colour picker eyedropper hex rgb', render: 'picker' }] }]
});

PAGES.push({
  id: 'fx', icon: '💱', title: 'Quick exchange', sub: "Convert SAR, AED, USD, CNY and more with rates you set",
  sections: [{ title: 'Quick exchange', items: [{ type: 'custom', id: 'fx', label: 'currency exchange rate convert yuan dollar riyal dirham', kw: 'صرف عملات currency exchange rate convert yuan dollar riyal dirham', render: 'fx' }] }]
});

PAGES.push({
  id: 'diag', icon: '🩺', title: 'Diagnostics', sub: 'Something not working? Check this PC and save one report file to send for help',
  sections: [{ title: 'Diagnostics report', items: [{ type: 'custom', id: 'diag', label: 'diagnostics report problem not working error help support log', kw: 'diagnose debug problem error report log fix not working', render: 'diag' }] }]
});


PAGES.push({
  id: 'gpumon', icon: '🎛️', title: 'GPU monitor', sub: 'Live GPU load, memory, temperature, power, which apps use the GPU, and local AI model memory',
  sections: [{ title: 'Live', items: [{ type: 'custom', id: 'gpumon', label: 'gpu monitor vram nvidia graphics card usage temperature power llm ollama model memory', kw: 'task manager gpu vram usage cuda ai model local llm', render: 'gpumon' }] }]
});
PAGES.push({
  id: 'pcrating', icon: '🏆', title: 'PC rating', sub: 'Timed tests of your processor, memory, disk and graphics, scored 1.0 to 9.9 like the old Windows Experience Index',
  sections: [{ title: 'Rate this PC', items: [{ type: 'custom', id: 'pcrating', label: 'pc rating score benchmark experience index performance speed test cpu memory ram disk ssd graphics gpu', kw: 'benchmark windows experience index winsat score how fast is my pc performance rating upgrade', render: 'pcrating' }] }]
});

// final sidebar order
{
  const ORDER = ['home', 'desklook', 'oscustomize', 'pcrating', 'gpumon', 'profiles', 'automation', 'system', 'devices', 'network', 'personalization', 'notifications', 'store', 'aurora-apps', 'aurora-plus', 'aurora-pro', 'addons', 'aurora-os', 'startmenu', 'ai', 'msoff', 'cursorfix', 'diag', 'mods', 'salah', 'zakat', 'worldclock', 'picker', 'fx', 'journey', 'space', 'utils', 'apps', 'gaming', 'controllers', 'diskmap', 'access', 'time', 'privacy', 'session', 'labs', 'tweaks', 'toolbox', 'wintools', 'update', 'backup', 'dupes', 'mycmds', 'looks', 'milestones', 'autodoc'];
  PAGES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
PAGES.push({
  id: 'btaudio', icon: '🎧', title: 'Bluetooth audio & LDAC', sub: 'See your headphones, switch codecs where the system allows it, and learn what Windows can and cannot do',
  sections: [{ title: 'Your Bluetooth audio', items: [{ type: 'custom', id: 'btaudio', label: 'Bluetooth audio LDAC codec aptX AAC SBC headphones high resolution a2dp', kw: 'ldac aptx aac sbc codec bluetooth headphones earbuds hi-res sony wh-1000xm', render: 'btaudio' }] }]
});

// The macOS-style desktop page only exists on Vorynth OS (Linux)
if (typeof window !== 'undefined' && window.api && (window.api.platform === 'win32' || window.api.platform === 'darwin')) {
  for (let i = PAGES.length - 1; i >= 0; i--) if (PAGES[i].id === 'desklook' || PAGES[i].id === 'oscustomize') PAGES.splice(i, 1);
}
// On Linux (Vorynth OS) only the pages that do not depend on Windows are shown.
if (typeof window !== 'undefined' && window.api && (window.api.platform === 'linux' || window.api.platform === 'darwin')) {
  const KEEP = ['btaudio', 'home', 'desklook', 'oscustomize', 'pcrating', 'gpumon', 'controllers', 'aurora-os', 'journey', 'space', 'utils', 'addons', 'aurora-apps', 'aurora-plus', 'aurora-pro', 'toolbox', 'backup', 'personalization', 'diskmap', 'dupes', 'mycmds', 'looks', 'milestones', 'autodoc', 'diag', 'salah', 'zakat', 'worldclock', 'picker', 'fx'].filter((id) => !((id === 'desklook' || id === 'oscustomize') && window.api.platform !== 'linux'));
  for (let i = PAGES.length - 1; i >= 0; i--) if (!KEEP.includes(PAGES[i].id)) PAGES.splice(i, 1);
}
