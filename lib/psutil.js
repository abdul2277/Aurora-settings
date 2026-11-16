/* Small pure helpers for talking to PowerShell and the Windows policy registry (kept free of Electron so they can be tested anywhere). */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// With -EncodedCommand and redirected output, Windows PowerShell writes errors to stderr as CLIXML ("#< CLIXML <Objs ...>").
// Turn that back into the sentence PowerShell meant.
function cleanPsError(raw, fallback) {
  let s = String(raw || '').trim();
  if (/^#<\s*CLIXML/i.test(s)) {
    const parts = [...s.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) => m[1]);
    s = parts.join('');
  }
  s = s.replace(/_x000D_|_x000A_/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return (s || fallback || 'PowerShell failed').slice(0, 400);
}

// HKCU\Software\Policies\X has a machine-wide twin at HKLM\SOFTWARE\Policies\X (needs admin). Null for anything else.
const policyAlt = (path) => (typeof path === 'string' && /^HKCU:\\Software\\Policies\\/i.test(path) ? path.replace(/^HKCU:\\Software\\Policies/i, 'HKLM:\\SOFTWARE\\Policies') : null);
const regWriteScript = (path, names, v) => names.map((n) => `if (-not (Test-Path ${q(path)})) { New-Item -Path ${q(path)} -Force | Out-Null }; New-ItemProperty -Path ${q(path)} -Name ${q(n)} -Value ${Number(v)} -PropertyType DWord -Force | Out-Null`).join('; ');
const regReadScript = (path, name) => `(Get-ItemProperty -Path ${q(path)} -Name ${q(name)} -ErrorAction SilentlyContinue).${q(name)}`;
// A policy switch is "on" (allowed) unless a block of the "off" value exists in either place.
const policyState = (hkcu, hklm, t, defaultOn) => { const vals = [hkcu, hklm].filter((x) => x != null && x !== '').map(Number); return vals.length ? !vals.includes(t.off) : defaultOn; };

// Wraps a script so it runs in an elevated PowerShell (one Windows permission prompt). Used for machine-wide settings.
const adminCmd = (body) => `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-EncodedCommand','${Buffer.from(body, 'utf16le').toString('base64')}'`;

module.exports = { adminCmd, q, cleanPsError, policyAlt, regWriteScript, regReadScript, policyState };
