// Vorynth Doctor: collects read-only facts about the PC and turns them into plain findings with safe, named fixes.
const os = require('os');
const fs = require('fs');

// ---- Windows probe: ONE read-only PowerShell script that prints JSON. Every probe is wrapped so one failure never breaks the rest. ----
const WIN_PROBE = String.raw`
$ErrorActionPreference='SilentlyContinue'
$r=@{}; $r.hw=@{}
try{ $d=Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':')); $r.diskFreeGB=[math]::Round($d.Free/1GB,1); $r.diskTotalGB=[math]::Round(($d.Free+$d.Used)/1GB,1) }catch{}
try{ $r.diskHealth=@(Get-PhysicalDisk | ForEach-Object { @{name=$_.FriendlyName; health=[string]$_.HealthStatus} }) }catch{}
try{ $r.tempMB=[math]::Round((Get-ChildItem $env:TEMP -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1MB) }catch{}
try{ $r.pendingReboot=[bool]((Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')) }catch{}
try{ $b=(Get-CimInstance Win32_OperatingSystem); $r.uptimeDays=[math]::Round(((Get-Date)-$b.LastBootUpTime).TotalDays,1); $r.memUsedPct=[math]::Round(100-($b.FreePhysicalMemory/$b.TotalVisibleMemorySize*100)) }catch{}
try{ $r.dnsOk=[bool](Resolve-DnsName microsoft.com -QuickTimeout -ErrorAction Stop) }catch{ $r.dnsOk=$false }
try{ $r.pingOk=[bool](Test-Connection 1.1.1.1 -Count 1 -Quiet) }catch{ $r.pingOk=$false }
try{ $core=@('Winmgmt','EventLog','Dnscache','mpssvc','WinDefend','BITS','wuauserv','Spooler','Audiosrv','W32Time'); $r.services=@($core | ForEach-Object { $s=Get-Service $_ -ErrorAction SilentlyContinue; if($s){ @{name=$_; status=[string]$s.Status; start=[string]$s.StartType} } }) }catch{}
try{ $m=Get-MpComputerStatus; $r.defenderRealtime=[bool]$m.RealTimeProtectionEnabled; $r.defenderSigAgeDays=[int]$m.AntivirusSignatureAge }catch{}
try{ $r.firewallOff=@(Get-NetFirewallProfile | Where-Object { -not $_.Enabled } | ForEach-Object { [string]$_.Name }) }catch{}
try{ $r.startupCount=@(Get-CimInstance Win32_StartupCommand).Count }catch{}
try{ $r.errors24h=@(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddHours(-24)} -MaxEvents 500 -ErrorAction SilentlyContinue).Count }catch{}
try{ $r.crashes30d=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=41;StartTime=(Get-Date).AddDays(-30)} -ErrorAction SilentlyContinue).Count }catch{}
try{ $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1; $r.hw=@{}; $r.hw.cpu=@{name=($cpu.Name -replace '\s+',' ').Trim(); cores=[int]$cpu.NumberOfCores; threads=[int]$cpu.NumberOfLogicalProcessors; maxMHz=[int]$cpu.MaxClockSpeed; load=[int]$cpu.LoadPercentage}; $r.cpuLoad=[int]$cpu.LoadPercentage }catch{}
try{ $t=Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop; $r.cpuTempC=[math]::Round((($t | Measure-Object CurrentTemperature -Maximum).Maximum/10)-273.15) }catch{}
try{ $r.hw.gpus=@(Get-CimInstance Win32_VideoController | ForEach-Object { @{name=$_.Name; driver=$_.DriverVersion; driverDate=$(if($_.DriverDate){ $_.DriverDate.ToString('yyyy-MM-dd') } else { '' }); status=[string]$_.Status; err=[int]$_.ConfigManagerErrorCode; vramMB=[math]::Round($_.AdapterRAM/1MB)} }) }catch{}
try{ $nv=Get-Command nvidia-smi -ErrorAction SilentlyContinue; if($nv){ $o=& nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>$null; if($o){ $r.gpuTempC=[int](($o | Select-Object -First 1).Trim()) } } }catch{}
try{ $mods=@(Get-CimInstance Win32_PhysicalMemory); $r.hw.ram=@{totalGB=[math]::Round(($mods | Measure-Object Capacity -Sum).Sum/1GB); modules=@($mods | ForEach-Object { @{sizeGB=[math]::Round($_.Capacity/1GB); speed=[int]$_.Speed; maker=([string]$_.Manufacturer).Trim(); slot=[string]$_.DeviceLocator} }) } }catch{}
try{ $bb=Get-CimInstance Win32_BaseBoard; $bi=Get-CimInstance Win32_BIOS; $r.hw.board=@{maker=[string]$bb.Manufacturer; product=[string]$bb.Product; bios=[string]$bi.SMBIOSBIOSVersion; biosDate=$(if($bi.ReleaseDate){ $bi.ReleaseDate.ToString('yyyy-MM-dd') } else { '' })} }catch{}
try{ $r.pnpErrors=@(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | Select-Object -First 10 | ForEach-Object { @{name=[string]$_.Name; code=[int]$_.ConfigManagerErrorCode} }) }catch{}
try{ $r.wheaCount=@(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-WHEA-Logger';StartTime=(Get-Date).AddDays(-30)} -ErrorAction SilentlyContinue).Count }catch{}
try{ $fc=Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity -ErrorAction Stop | Select-Object -First 1; $ds=Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData -ErrorAction Stop | Select-Object -First 1; if($ds.DesignedCapacity -gt 0){ $r.batteryHealthPct=[math]::Round($fc.FullChargedCapacity/$ds.DesignedCapacity*100) } }catch{}
try{ $rel=@{}; Get-PhysicalDisk | ForEach-Object { $c=$_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue; if($c){ $rel[[string]$_.DeviceId]=$c } }; $r.hw.disks=@(Get-PhysicalDisk | ForEach-Object { $c=$rel[[string]$_.DeviceId]; @{name=[string]$_.FriendlyName; type=[string]$_.MediaType; bus=[string]$_.BusType; sizeGB=[math]::Round($_.Size/1GB); health=[string]$_.HealthStatus; tempC=$(if($c -and $c.Temperature){ [int]$c.Temperature } else { $null }); wearPct=$(if($c -and $c.Wear -ne $null){ [int]$c.Wear } else { $null }); readErrors=$(if($c -and $c.ReadErrorsTotal -ne $null){ [int]$c.ReadErrorsTotal } else { $null }); hours=$(if($c -and $c.PowerOnHours){ [int]$c.PowerOnHours } else { $null })} }) }catch{}
try{ $r.hw.nics=@(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object { @{name=[string]$_.Name; desc=[string]$_.InterfaceDescription; status=[string]$_.Status; speed=[string]$_.LinkSpeed; speedBps=[double]$_.Speed; wifi=[bool]($_.PhysicalMediaType -match '802.11|Native')} }) }catch{}
try{ $r.hw.audio=@(Get-CimInstance Win32_SoundDevice | ForEach-Object { @{name=[string]$_.Name; status=[string]$_.Status} }) }catch{}
try{ $r.hw.monitors=@(Get-CimInstance Win32_DesktopMonitor | ForEach-Object { [string]$_.Name }); $vc=Get-CimInstance Win32_VideoController | Select-Object -First 1; if($vc -and $vc.CurrentHorizontalResolution){ $r.hw.display=@{w=[int]$vc.CurrentHorizontalResolution; h=[int]$vc.CurrentVerticalResolution; hz=[int]$vc.CurrentRefreshRate} } }catch{}
try{ $r.hw.bluetooth=@(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Adapter|Radio|Wireless|Intel|Realtek|MediaTek|Qualcomm' } | Select-Object -First 3 | ForEach-Object { @{name=[string]$_.FriendlyName; status=[string]$_.Status} }) }catch{}
try{ $r.hw.cameras=@(Get-PnpDevice -Class Camera,Image -ErrorAction SilentlyContinue | Select-Object -First 3 | ForEach-Object { @{name=[string]$_.FriendlyName; status=[string]$_.Status} }) }catch{}
try{ $sr=(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0 and Type='Driver'"); $r.pendingDrivers=[int]$sr.Updates.Count }catch{}
try{ $g=@{}; $o=(powercfg /getactivescheme | Out-String); if($o -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'){ $g.plan=$Matches[1].ToLower() }; $v=(Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar' -ErrorAction SilentlyContinue).AutoGameModeEnabled; if($v -ne $null){ $g.gameMode=[int]$v }; $a=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' -ErrorAction SilentlyContinue).AppCaptureEnabled; $b=(Get-ItemProperty 'HKCU:\System\GameConfigStore' -ErrorAction SilentlyContinue).GameDVR_Enabled; if($a -ne $null -or $b -ne $null){ $g.capture=[int](($a -eq 1) -or ($b -eq 1)) }; $h=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' -ErrorAction SilentlyContinue).HwSchMode; if($h -ne $null){ $g.hags=[int]$h }; $r.gaming=$g }catch{}
$r | ConvertTo-Json -Compress -Depth 6
`;

// ---- Linux/mac fallback probe (plain Node) ----
async function nodeProbe() {
  const r = { uptimeDays: Math.round(os.uptime() / 8640) / 10, memUsedPct: Math.round(100 - (os.freemem() / os.totalmem()) * 100) };
  try { const s = fs.statfsSync('/'); r.diskFreeGB = Math.round((s.bavail * s.bsize) / 1e8) / 10; r.diskTotalGB = Math.round((s.blocks * s.bsize) / 1e8) / 10; } catch (_) {}
  try { await require('dns').promises.resolve4('example.com'); r.dnsOk = true; } catch (_) { r.dnsOk = false; }
  r.pingOk = r.dnsOk;
  const c = os.cpus(); r.hw = { cpu: { name: c[0] ? c[0].model.replace(/\s+/g, ' ').trim() : '', cores: c.length, threads: c.length, maxMHz: c[0] ? c[0].speed : 0 }, ram: { totalGB: Math.round(os.totalmem() / 1073741824), modules: [] }, gpus: [], board: {} };
  const rd = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) { return ''; } };
  r.hw.board = { maker: rd('/sys/devices/virtual/dmi/id/board_vendor'), product: rd('/sys/devices/virtual/dmi/id/board_name'), bios: rd('/sys/devices/virtual/dmi/id/bios_version'), biosDate: rd('/sys/devices/virtual/dmi/id/bios_date') };
  return r;
}

// ---- pure: facts -> findings. Each finding: { id, level: ok|warn|bad, title, detail, fix? } ----
function evaluate(f) {
  const out = []; const add = (id, level, title, detail, fix) => out.push({ id, level, title, detail, fix: fix || null });
  if (f.diskFreeGB != null && f.diskTotalGB) { const pct = (f.diskFreeGB / f.diskTotalGB) * 100; const t = 'System drive free space: ' + f.diskFreeGB + ' GB (' + Math.round(pct) + '%)'; if (pct < 8 || f.diskFreeGB < 5) add('disk', 'bad', t, 'Windows needs free space for updates and temporary files. Clean temp files and move big files off this drive.', 'cleantemp'); else if (pct < 15) add('disk', 'warn', t, 'Getting low. Cleaning temp files helps.', 'cleantemp'); else add('disk', 'ok', t, 'Plenty of room.'); }
  if (Array.isArray(f.diskHealth) && f.diskHealth.length) { const bad = f.diskHealth.filter((d) => d.health && d.health !== 'Healthy'); if (bad.length) add('diskhealth', 'bad', 'A drive reports problems: ' + bad.map((d) => d.name + ' (' + d.health + ')').join(', '), 'Back up your files now. The drive may be failing. A scan can show more.', 'chkdsk'); else add('diskhealth', 'ok', 'All drives report Healthy', 'No hardware warnings from Windows.'); }
  if (f.tempMB != null) { if (f.tempMB > 3000) add('temp', 'warn', 'Temp folder is ' + (f.tempMB / 1024).toFixed(1) + ' GB', 'Old temporary files are piling up. Safe to clean.', 'cleantemp'); else add('temp', 'ok', 'Temp folder is ' + f.tempMB + ' MB', 'Nothing to clean.'); }
  if (f.pendingReboot) add('reboot', 'warn', 'A restart is waiting', 'Updates or installs need a restart to finish. Many odd problems go away after restarting.', null); else if (f.pendingReboot === false) add('reboot', 'ok', 'No restart pending', 'Nothing is waiting for a restart.');
  if (f.uptimeDays != null) { if (f.uptimeDays > 14) add('uptime', 'warn', 'PC has been on for ' + f.uptimeDays + ' days', 'A restart clears memory leaks and finishes updates.', null); else add('uptime', 'ok', 'Uptime: ' + f.uptimeDays + ' days', 'Fine.'); }
  if (f.memUsedPct != null) { if (f.memUsedPct >= 90) add('mem', 'warn', 'Memory is ' + f.memUsedPct + '% used', 'Close heavy apps or restart. If this is constant, the PC needs more RAM.', null); else add('mem', 'ok', 'Memory use: ' + f.memUsedPct + '%', 'Fine.'); }
  if (f.pingOk === false) add('net', 'bad', 'No internet connection', 'The PC cannot reach the internet. Check the cable/Wi-Fi and the router. Resetting the network stack can fix software-side problems.', 'resetnet');
  else if (f.dnsOk === false) add('dns', 'bad', 'Internet works but names do not resolve (DNS)', 'Websites fail to open even though you are online. Flushing the DNS cache usually fixes it.', 'flushdns');
  else if (f.pingOk) add('net', 'ok', 'Internet and DNS work', 'Connection looks healthy.');
  if (Array.isArray(f.services) && f.services.length) { const critical = ['Winmgmt', 'EventLog', 'Dnscache', 'mpssvc', 'WinDefend']; const down = f.services.filter((s) => critical.includes(s.name) && s.status !== 'Running'); const spool = f.services.filter((s) => ['Spooler', 'Audiosrv', 'BITS', 'W32Time'].includes(s.name) && s.start === 'Automatic' && s.status !== 'Running'); const all = down.concat(spool);
    if (all.length) add('services', down.length ? 'bad' : 'warn', 'Services not running: ' + all.map((s) => s.name).join(', '), 'These should be on. Starting them often fixes no sound, no printing, or broken updates.', 'startservices'); else add('services', 'ok', 'Core Windows services are running', 'Nothing stopped that should be on.'); }
  if (f.defenderRealtime === false) add('defender', 'warn', 'Windows Defender real-time protection is off', 'Turn it on in Windows Security unless another antivirus is installed.', null); else if (f.defenderRealtime) { if (f.defenderSigAgeDays > 7) add('defender', 'warn', 'Defender definitions are ' + f.defenderSigAgeDays + ' days old', 'Run Windows Update to refresh them.', null); else add('defender', 'ok', 'Defender is on and up to date', 'Protection is active.'); }
  if (Array.isArray(f.firewallOff) && f.firewallOff.length) add('firewall', 'warn', 'Firewall is off for: ' + f.firewallOff.join(', '), 'Turn it back on in Windows Security unless you did it on purpose.', null); else if (Array.isArray(f.firewallOff)) add('firewall', 'ok', 'Firewall is on for all networks', 'Fine.');
  if (f.startupCount != null) { if (f.startupCount > 15) add('startup', 'warn', f.startupCount + ' programs start with Windows', 'Too many slow the boot. Disable the ones you do not need in the Startup page.', null); else add('startup', 'ok', f.startupCount + ' startup programs', 'Fine.'); }
  if (f.errors24h != null) { if (f.errors24h > 100) add('events', 'warn', f.errors24h + ' system errors in the last 24 hours', 'Many errors point to a driver or hardware problem. Deep repair can check system files.', 'sfc'); else add('events', 'ok', f.errors24h + ' system errors in the last 24 hours', 'Normal.'); }
  if (f.crashes30d > 0) add('crashes', 'bad', 'The PC lost power or crashed ' + f.crashes30d + ' time(s) in 30 days', 'Unexpected shutdowns can mean a failing power supply, overheating, or a bad driver.', null);
  const hw = f.hw || {};
  if (f.cpuTempC != null) { if (f.cpuTempC >= 90) add('cputemp', 'bad', 'CPU temperature is ' + f.cpuTempC + ' C', 'Dangerously hot. Check the cooler, fans and dust, and consider new thermal paste.', null); else if (f.cpuTempC >= 80) add('cputemp', 'warn', 'CPU temperature is ' + f.cpuTempC + ' C', 'Running warm. Clean dust and check airflow.', null); else add('cputemp', 'ok', 'CPU temperature: ' + f.cpuTempC + ' C', 'Fine.'); }
  if (f.cpuLoad != null) { if (f.cpuLoad >= 90) add('cpuload', 'warn', 'CPU is at ' + f.cpuLoad + '% load right now', 'Something is using the whole processor. Check Task Manager for the busy program.', null); else add('cpuload', 'ok', 'CPU load: ' + f.cpuLoad + '%', 'Fine.'); }
  if (Array.isArray(hw.gpus)) { hw.gpus.forEach((g, i) => { const nm = g.name || ('GPU ' + (i + 1)); if (g.err) add('gpu' + i, 'bad', nm + ' has a driver/device error (code ' + g.err + ')', 'The graphics driver is not working properly. Reinstall the driver from NVIDIA/AMD/Intel, then restart.', 'pnpscan'); else { const yrs = g.driverDate ? (Date.now() - Date.parse(g.driverDate)) / 31557600000 : 0; if (yrs > 2 && !/Microsoft Basic|Remote/i.test(nm)) add('gpu' + i, 'warn', nm + ': driver is ' + yrs.toFixed(1) + ' years old', 'Newer drivers fix crashes and add game support. Update from the maker website.', null); else add('gpu' + i, 'ok', nm + ': driver looks fine', (g.driverDate ? 'Driver dated ' + g.driverDate + '.' : 'Working.')); } }); }
  if (f.gpuTempC != null) { if (f.gpuTempC >= 92) add('gputemp', 'bad', 'GPU temperature is ' + f.gpuTempC + ' C', 'Too hot. Check case airflow and the GPU fans.', null); else if (f.gpuTempC >= 85) add('gputemp', 'warn', 'GPU temperature is ' + f.gpuTempC + ' C', 'Running hot. Improve airflow or set a fan curve.', null); else add('gputemp', 'ok', 'GPU temperature: ' + f.gpuTempC + ' C', 'Fine.'); }
  if (hw.ram && Array.isArray(hw.ram.modules) && hw.ram.modules.length) { const sp = [...new Set(hw.ram.modules.map((m) => m.speed).filter(Boolean))]; if (hw.ram.modules.length === 1 && hw.ram.totalGB >= 8) add('ramchan', 'warn', 'Only one RAM stick installed (' + hw.ram.totalGB + ' GB)', 'A single stick runs in single-channel mode. Two matching sticks are noticeably faster for games and heavy work.', null); else if (sp.length > 1) add('ramspeed', 'warn', 'RAM sticks run at different speeds (' + sp.join(', ') + ' MHz)', 'Mixed speeds make everything run at the slowest. Use a matching kit.', null); else add('ram', 'ok', 'RAM: ' + hw.ram.totalGB + ' GB in ' + hw.ram.modules.length + ' stick(s)', 'Configuration looks fine.'); }
  if (f.wheaCount != null) { if (f.wheaCount > 0) add('whea', 'bad', f.wheaCount + ' hardware error report(s) in 30 days (WHEA)', 'Windows logged errors from the CPU, memory or PCIe devices. Run the memory test, check overclock settings and power supply.', 'memdiag'); else add('whea', 'ok', 'No hardware error reports (WHEA)', 'The CPU, RAM and PCIe bus have not reported faults.'); }
  if (Array.isArray(f.pnpErrors)) { if (f.pnpErrors.length) add('pnp', 'bad', f.pnpErrors.length + ' device(s) have errors: ' + f.pnpErrors.slice(0, 3).map((d) => d.name).join(', ') + (f.pnpErrors.length > 3 ? '...' : ''), 'Open Device Manager to see them. Rescanning hardware can bring a device back; otherwise reinstall its driver.', 'pnpscan'); else add('pnp', 'ok', 'No device errors', 'Every device is working.'); }
  if (hw.board && hw.board.biosDate) { const yrs = (Date.now() - Date.parse(hw.board.biosDate)) / 31557600000; if (yrs > 3) add('bios', 'warn', 'BIOS is ' + yrs.toFixed(1) + ' years old (' + hw.board.biosDate + ')', 'Motherboard makers fix stability and CPU support in BIOS updates. Check ' + (hw.board.maker || 'the maker') + "'s support page for " + (hw.board.product || 'your board') + '. Update carefully.', null); else add('bios', 'ok', 'BIOS date: ' + hw.board.biosDate, 'Reasonably recent.'); }
  if (f.batteryHealthPct != null) { if (f.batteryHealthPct < 60) add('battery', 'warn', 'Battery holds only ' + f.batteryHealthPct + '% of its original capacity', 'The battery is worn. Plan a replacement.', null); else add('battery', 'ok', 'Battery health: ' + f.batteryHealthPct + '%', 'Fine.'); }
  if (Array.isArray(hw.disks)) hw.disks.forEach((d, i) => { const nm = d.name || ('Drive ' + (i + 1)); const bits = []; let lvl = 'ok';
    if (d.wearPct != null && d.wearPct >= 80) { lvl = 'bad'; bits.push('worn ' + d.wearPct + '%'); } else if (d.wearPct != null && d.wearPct >= 60) { if (lvl !== 'bad') lvl = 'warn'; bits.push('worn ' + d.wearPct + '%'); }
    if (d.tempC != null && d.tempC >= 60) { lvl = 'bad'; bits.push(d.tempC + ' C hot'); } else if (d.tempC != null && d.tempC >= 55) { if (lvl !== 'bad') lvl = 'warn'; bits.push(d.tempC + ' C warm'); }
    if (d.readErrors > 0) { if (lvl !== 'bad') lvl = 'warn'; bits.push(d.readErrors + ' read errors'); }
    if (bits.length) add('drive' + i, lvl, nm + ': ' + bits.join(', '), lvl === 'bad' ? 'Back up this drive now and plan to replace it.' : 'Keep an eye on it and keep a backup.', 'chkdsk'); });
  if (Array.isArray(hw.nics)) { const up = hw.nics.filter((n) => n.status === 'Up'); if (hw.nics.length && !up.length) add('nic', 'warn', 'No network adapter is connected', 'All network adapters are down. Check the cable or Wi-Fi.', 'resetnet'); else up.forEach((n, i) => { if (n.speedBps && n.speedBps < 100e6) add('nicspeed' + i, 'warn', n.name + ' link is only ' + n.speed, 'A very slow link. Try another cable or port, or check the router.', null); }); }
  if (Array.isArray(hw.audio) && hw.audio.some((a) => a.status && a.status !== 'OK')) add('audio', 'warn', 'An audio device reports a problem: ' + hw.audio.filter((a) => a.status !== 'OK').map((a) => a.name).join(', '), 'Restarting the audio service or reinstalling the audio driver usually fixes no-sound problems.', 'startservices');
  if (Array.isArray(hw.bluetooth) && hw.bluetooth.some((b) => b.status && b.status !== 'OK')) add('bt', 'warn', 'Bluetooth adapter reports a problem', 'Turn Bluetooth off and on, or reinstall its driver.', 'pnpscan');
  if (f.pendingDrivers != null) { if (f.pendingDrivers > 0) add('drivers', 'warn', f.pendingDrivers + ' driver update(s) available from Windows Update', 'Newer drivers replace old or buggy ones. Vorynth can install them for you.', 'driverupdate'); else add('drivers', 'ok', 'Windows has no newer drivers waiting', 'Drivers are current as far as Windows Update knows.'); }
  return out;
}
const score = (list) => { let s = 100; list.forEach((x) => { if (x.level === 'bad') s -= 18; else if (x.level === 'warn') s -= 7; }); return Math.max(0, s); };

// ---- fixes: a closed whitelist. Nothing here accepts input from the UI except the fix id. ----
const FIXES = {
  flushdns: { title: 'Flush the DNS cache', admin: false, script: 'Clear-DnsClientCache; ipconfig /flushdns | Out-Null' },
  startservices: { title: 'Start stopped core services', admin: true, script: "foreach($n in 'Winmgmt','EventLog','Dnscache','mpssvc','WinDefend','BITS','Spooler','Audiosrv','W32Time'){ $s=Get-Service $n -ErrorAction SilentlyContinue; if($s -and $s.StartType -ne 'Disabled' -and $s.Status -ne 'Running'){ Start-Service $n -ErrorAction SilentlyContinue } }" },
  resetnet: { title: 'Reset the network stack (restart needed)', admin: true, script: 'netsh winsock reset | Out-Null; netsh int ip reset | Out-Null; ipconfig /flushdns | Out-Null' },
  chkdsk: { title: 'Scan the system drive for errors (online, read-only)', admin: true, script: "Repair-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) -Scan" },
  sfc: { title: 'Check and repair Windows system files (sfc, takes a while)', admin: true, detached: true, script: 'sfc /scannow' },
  dism: { title: 'Repair the Windows image (DISM, takes a while)', admin: true, detached: true, script: 'DISM /Online /Cleanup-Image /RestoreHealth' },
  memdiag: { title: 'Open Windows Memory Diagnostic (tests your RAM after a restart)', admin: false, script: 'Start-Process mdsched.exe' },
  pnpscan: { title: 'Rescan hardware for missing or broken devices', admin: true, script: 'pnputil /scan-devices | Out-Null' },
  appupdate: { title: 'Update all installed apps (winget)', admin: true, detached: true, script: 'winget upgrade --all --silent --accept-source-agreements --accept-package-agreements' },
  wureset: { title: 'Reset Windows Update components', admin: true, script: "Stop-Service wuauserv,bits -Force -ErrorAction SilentlyContinue; if(Test-Path $env:SystemRoot\\SoftwareDistribution){ Rename-Item $env:SystemRoot\\SoftwareDistribution SoftwareDistribution.old-$(Get-Date -Format yyyyMMddHHmm) -ErrorAction SilentlyContinue }; Start-Service bits,wuauserv -ErrorAction SilentlyContinue" }
,
  // Restore point first, so every change after it can be rolled back from Windows itself. Needs admin; lifts the 1-per-day limit only for this call.
  restorepoint: { title: 'Create a restore point', admin: true, script: String.raw`$k='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'; $old=(Get-ItemProperty $k -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency; try{ Enable-ComputerRestore -Drive ($env:SystemDrive + '\') -ErrorAction SilentlyContinue; Set-ItemProperty $k -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord; Checkpoint-Computer -Description 'Vorynth Doctor' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop } finally { if($old -eq $null){ Remove-ItemProperty $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue } else { Set-ItemProperty $k -Name SystemRestorePointCreationFrequency -Value $old -Type DWord } }` },
  // Used after the restore point to confirm it exists (read-only). Prints an ISO time or nothing.
  restorecheck: { title: 'Check the restore point', admin: false, script: String.raw`Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Where-Object { $_.Description -eq 'Vorynth Doctor' } | Select-Object -Last 1 | ForEach-Object { [Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime).ToString('o') }` }
};

// ---- gaming readiness: reversible per-user tweaks. Same closed-whitelist idea: only the tweak NAME comes from the UI. ----
const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const GUID_RX = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';
function evaluateGaming(g) {
  if (!g || typeof g !== 'object') return null;
  const items = [];
  if (g.plan) { const on = g.plan === HIGH_PERF || g.plan === ULTIMATE; items.push({ id: 'power', on, title: 'High performance power plan', detail: on ? 'The PC may run at full speed.' : 'The current plan can hold the CPU back in games.' }); }
  if (g.gameMode != null) items.push({ id: 'gamemode', on: g.gameMode === 1, title: 'Windows Game Mode on', detail: g.gameMode === 1 ? 'Windows favours the running game.' : 'Game Mode helps Windows keep background work away from your game.' });
  if (g.capture != null) items.push({ id: 'capture', on: g.capture === 0, title: 'Background game recording off', detail: g.capture === 0 ? 'No hidden recording is eating GPU time.' : 'Xbox Game Bar background capture can cost a few FPS.' });
  if (g.hags != null) items.push({ id: 'hags', on: g.hags === 2, info: true, title: 'Hardware GPU scheduling ' + (g.hags === 2 ? 'on' : 'off'), detail: 'Doctor does not change this one: it needs a restart and a recent graphics driver. Windows Settings > Display > Graphics.' });
  const t = items.filter((i) => !i.info);
  return { items, score: t.length ? Math.round((t.filter((i) => i.on).length / t.length) * 100) : null };
}
const TWEAK_NAMES = ['power', 'gamemode', 'capture'];
const PREV_RX = { power: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, gamemode: /^(none|[01])$/, capture: /^(none|[01])\|(none|[01])$/ };
const validPrev = (name, prev) => !!PREV_RX[name] && typeof prev === 'string' && PREV_RX[name].test(prev);
const parsePrev = (out) => { const m = /PREV=([^\r\n]*)/.exec(String(out || '')); return m ? m[1].trim().toLowerCase() : null; };
function tweakApplyScript(name) {
  if (name === 'power') return `$o=(powercfg /getactivescheme | Out-String); $prev=''; if($o -match '${GUID_RX}'){ $prev=$Matches[1].ToLower() }
powercfg /setactive ${HIGH_PERF} 2>$null
if($LASTEXITCODE -ne 0){ $d=(powercfg -duplicatescheme ${ULTIMATE} | Out-String); if($d -match '${GUID_RX}'){ powercfg /setactive $Matches[1] } else { throw 'This PC has no high performance power plan' } }
Write-Output ('PREV=' + $prev)`;
  if (name === 'gamemode') return String.raw`$k='HKCU:\Software\Microsoft\GameBar'; if(-not (Test-Path $k)){ New-Item $k -Force | Out-Null }; $p=(Get-ItemProperty $k).AutoGameModeEnabled; Set-ItemProperty $k -Name AutoGameModeEnabled -Value 1 -Type DWord; Write-Output ('PREV=' + $(if($p -eq $null){'none'}else{[int]$p}))`;
  if (name === 'capture') return String.raw`$k1='HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR'; $k2='HKCU:\System\GameConfigStore'; foreach($k in $k1,$k2){ if(-not (Test-Path $k)){ New-Item $k -Force | Out-Null } }; $a=(Get-ItemProperty $k1).AppCaptureEnabled; $b=(Get-ItemProperty $k2).GameDVR_Enabled; Set-ItemProperty $k1 -Name AppCaptureEnabled -Value 0 -Type DWord; Set-ItemProperty $k2 -Name GameDVR_Enabled -Value 0 -Type DWord; Write-Output ('PREV=' + $(if($a -eq $null){'none'}else{[int]$a}) + '|' + $(if($b -eq $null){'none'}else{[int]$b}))`;
  throw new Error('Unknown tweak');
}
function tweakUndoScript(name, prev) {
  if (!validPrev(name, prev)) throw new Error('Bad previous value');
  if (name === 'power') return `powercfg /setactive ${prev}`;
  const set = (key, prop, v) => (v === 'none' ? `Remove-ItemProperty '${key}' -Name ${prop} -ErrorAction SilentlyContinue` : `Set-ItemProperty '${key}' -Name ${prop} -Value ${v} -Type DWord`);
  if (name === 'gamemode') return set('HKCU:\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', prev);
  const [a, b] = prev.split('|');
  return set('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', a) + '; ' + set('HKCU:\\System\\GameConfigStore', 'GameDVR_Enabled', b);
}

// ---- scan stepper: which findings belong to which step of the animated scan ----
const STEPS = [
  { k: 'windows', title: 'Windows', art: 'windows', test: null },
  { k: 'drives', title: 'Drives', art: 'drive', test: /^(disk|diskhealth|drive\d+)$/ },
  { k: 'memory', title: 'Memory', art: 'ram', test: /^(ram|ramchan|ramspeed|mem|whea)$/ },
  { k: 'cpu', title: 'Processor', art: 'cpu', test: /^(cputemp|cpuload)$/ },
  { k: 'gpu', title: 'Graphics', art: 'gpu', test: /^(gpu\d*|gputemp)$/ },
  { k: 'network', title: 'Network', art: 'net', test: /^(net|dns|nic|nicspeed\d+)$/ },
  { k: 'devices', title: 'Board & devices', art: 'board', test: /^(bios|crashes|audio|bt|pnp)$/ }
];
const stepOf = (id) => { const s = STEPS.find((x) => x.test && x.test.test(id)); return s ? s.k : 'windows'; };
function stepResults(findings) {
  const rank = { bad: 3, warn: 2, ok: 1 };
  return STEPS.map((s) => { const list = findings.filter((f) => stepOf(f.id) === s.k); const level = list.reduce((w, f) => (rank[f.level] > (rank[w] || 0) ? f.level : w), null) || 'ok'; return { k: s.k, title: s.title, art: s.art, level, findings: list }; });
}
module.exports = { WIN_PROBE, nodeProbe, evaluate, score, FIXES, evaluateGaming, TWEAK_NAMES, validPrev, parsePrev, tweakApplyScript, tweakUndoScript, STEPS, stepOf, stepResults };
