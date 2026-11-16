// The Windows side of Aurora Store: small PowerShell scripts (run through Aurora's own ps() helper) and shortcut handling.
const fs = require('fs');
const path = require('path');
const { quoteArgs } = require('./appstore');

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const listInstalledScript = () => `
$roots = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
$out = foreach ($r in $roots) {
  Get-ItemProperty -Path $r -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and -not $_.SystemComponent } | ForEach-Object {
    [pscustomobject]@{ key = $_.PSPath; name = [string]$_.DisplayName; version = [string]$_.DisplayVersion; publisher = [string]$_.Publisher; uninstall = [string]$_.UninstallString; quiet = [string]$_.QuietUninstallString }
  }
}
@($out) | ConvertTo-Json -Compress -Depth 3`;

const runScript = ({ file, args, admin }) => {
  const a = quoteArgs(args);
  const verb = admin ? ' -Verb RunAs' : '';
  const argPart = a ? ` -ArgumentList ${q(a)}` : '';
  return `$p = Start-Process -FilePath ${q(file)}${argPart}${verb} -Wait -PassThru
Write-Output ('AURORA_EXIT:' + $p.ExitCode)`;
};
const signatureScript = (file) => `$s = Get-AuthenticodeSignature -LiteralPath ${q(file)}
$subject = if ($s.SignerCertificate) { $s.SignerCertificate.GetNameInfo('SimpleName', $false) } else { '' }
[pscustomobject]@{ status = [string]$s.Status; signer = [string]$subject } | ConvertTo-Json -Compress`;
// Extracts entry by entry and refuses any entry that would land outside the destination folder (zip-slip).
const expandScript = (zip, dest) => `Add-Type -AssemblyName System.IO.Compression.FileSystem
$dest = [IO.Path]::GetFullPath(${q(dest)}); if (-not $dest.EndsWith([IO.Path]::DirectorySeparatorChar)) { $dest += [IO.Path]::DirectorySeparatorChar }
$z = [IO.Compression.ZipFile]::OpenRead(${q(zip)})
try {
  foreach ($e in $z.Entries) {
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($dest, $e.FullName))
    if (-not $target.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase)) { throw 'The download contains an unsafe file path, so it was not unpacked' }
    if ($e.FullName.EndsWith('/') -or $e.FullName.EndsWith([string][char]92)) { [void][IO.Directory]::CreateDirectory($target); continue }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
    [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true)
  }
} finally { $z.Dispose() }`;
const msixInstallScript = (file) => `Add-AppxPackage -Path ${q(file)}`;
const msixRemoveScript = (pfn) => `Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq ${q(pfn)} } | Remove-AppxPackage`;

function createWinRunner({ ps, shell, startMenuDir }) {
  const parseExit = (out) => { const m = /AURORA_EXIT:(-?\d+)/.exec(out || ''); if (!m) throw new Error('The installer did not report a result'); return Number(m[1]); };
  return {
    async listInstalled() {
      const out = await ps(listInstalledScript(), 60000);
      if (!out) return [];
      const v = JSON.parse(out); return (Array.isArray(v) ? v : [v]).filter((e) => e && e.name);
    },
    async run({ file, args, admin }) {
      try { return parseExit(await ps(runScript({ file, args, admin }), 45 * 60000)); }
      catch (e) { if (/canceled by the user|cancelled by the user/i.test(e.message)) return 1223; throw e; }
    },
    async signature(file) { return JSON.parse(await ps(signatureScript(file), 60000)); },
    async expand(zip, dest) { await ps(expandScript(zip, dest), 10 * 60000); },
    async msixInstall(file) { await ps(msixInstallScript(file), 10 * 60000); },
    async msixRemove(pfn) { await ps(msixRemoveScript(pfn), 5 * 60000); },
    async shortcut(name, target) {
      fs.mkdirSync(startMenuDir, { recursive: true });
      const lnk = path.join(startMenuDir, name.replace(/[^\w.\- ()+]/g, '_') + '.lnk');
      if (!shell.writeShortcutLink(lnk, 'create', { target, cwd: path.dirname(target) })) throw new Error('Could not create the Start menu shortcut');
      return lnk;
    },
    async removeShortcut(lnk) { if (lnk && path.dirname(lnk) === startMenuDir) fs.rmSync(lnk, { force: true }); }
  };
}
module.exports = { createWinRunner, listInstalledScript, runScript, signatureScript, expandScript, msixInstallScript, msixRemoveScript, q };
