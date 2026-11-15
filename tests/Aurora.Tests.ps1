# Self-contained tests for Aurora.ps1 using an in-memory registry (no Pester needed).
# Run:  pwsh -NoProfile -File tests/Aurora.Tests.ps1     (or powershell.exe on Windows)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\Aurora.ps1') -NoRun

$script:pass = 0; $script:fail = 0
function Check([bool] $ok, [string] $name) { if ($ok) { $script:pass++ } else { $script:fail++; Write-Host "FAIL: $name" -ForegroundColor Red } }

function New-FakeRegistry([bool] $admin) {
    $o = [pscustomobject]@{ Store = @{}; IsAdmin = $admin; DataDir = (Join-Path ([IO.Path]::GetTempPath()) ("aurora-test-" + [guid]::NewGuid())) }
    $o | Add-Member ScriptMethod Read { param($h, $p, $n) $k = "$h\$p\$n"; if ($this.Store.ContainsKey($k)) { $this.Store[$k] } else { $null } }
    $o | Add-Member ScriptMethod Write { param($h, $p, $n, $v) $this.Store["$h\$p\$n"] = $v }
    $o | Add-Member ScriptMethod Remove { param($h, $p, $n) $this.Store.Remove("$h\$p\$n") }
    return $o
}

# --- catalog sanity
$catalog = Get-AuroraCatalog
Check ($catalog.Count -ge 9) 'catalog has tweaks'
Check (@($catalog.Id | Select-Object -Unique).Count -eq $catalog.Count) 'tweak ids unique'
foreach ($t in $catalog) {
    foreach ($s in $t.Settings) {
        Check ($s.Hive -in 'HKCU', 'HKLM') "$($t.Id) hive valid"
        Check ($s.Path -notmatch '^(HK|Registry)') "$($t.Id) path is relative"
        Check ($s.Value -is [int]) "$($t.Id) value is DWORD"
    }
}
Check ((Resolve-AuroraTweaks 'Recommended').Count -eq @($catalog | Where-Object Recommended).Count) 'Recommended resolves'
Check ((Resolve-AuroraTweaks 'Recall,Copilot,Recall').Count -eq 2) 'dedupe + comma list'
Check ((Resolve-AuroraTweaks 'Recall,Copilot')[0].Id -eq 'Copilot') 'catalog order kept'
try { Resolve-AuroraTweaks 'Nope' | Out-Null; Check $false 'unknown id throws' } catch { Check $true 'unknown id throws' }

# --- admin: apply all, then undo restores exactly
$script:Backend = New-FakeRegistry $true
$script:Backend.Store['HKCU\Software\Microsoft\Windows\CurrentVersion\Search\BingSearchEnabled'] = 1     # pre-existing value
$script:Backend.Store['HKCU\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo\Enabled'] = 0     # already "off"
$before = $script:Backend.Store.Clone()
Check (@(Get-AuroraStatus | Where-Object State -eq 'On (default)').Count -ge 8) 'status before: mostly default'

$r = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'All')
$expected = ($catalog | ForEach-Object { $_.Settings.Count } | Measure-Object -Sum).Sum - 1   # one already set
Check ($r.Changed -eq $expected) "apply all changed $($r.Changed) (expected $expected)"
Check ($r.Skipped.Count -eq 0) 'admin: nothing skipped'
Check (Test-Path $r.BackupFile) 'backup written'
Check (@(Get-AuroraStatus | Where-Object State -ne 'Off (blocked)').Count -eq 0) 'status after: all blocked'
Check ($script:Backend.Store['HKLM\Software\Policies\Microsoft\Windows\WindowsAI\AllowRecallEnablement'] -eq 0) 'recall policy written'

$r2 = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'All')
Check ($r2.Changed -eq 0 -and $null -eq $r2.BackupFile) 'second apply is a no-op (idempotent)'

$u = Invoke-AuroraUndo
Check ($u.Restored -eq $expected) 'undo restored every change'
Check ($script:Backend.Store.Count -eq $before.Count) 'undo removed values that did not exist'
foreach ($k in $before.Keys) { Check ($script:Backend.Store[$k] -eq $before[$k]) "undo restored $k" }
Check (@(Get-AuroraBackups).Count -eq 0) 'undone backup is marked .undone'
try { Invoke-AuroraUndo | Out-Null; Check $false 'undo with no backup throws' } catch { Check $true 'undo with no backup throws' }

# --- WhatIf changes nothing
$snap = $script:Backend.Store.Clone()
Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'All') -WhatIf | Out-Null
Check ($script:Backend.Store.Count -eq $snap.Count) 'WhatIf leaves registry untouched'

# --- -WhatIf must not leak into helper pipelines (regression)
$WhatIfPreference = $true
$w = @(Resolve-AuroraTweaks 'Recall,Paint')
$WhatIfPreference = $false
Check ($w.Count -eq 2 -and $w[0].Id -eq 'Recall') 'Resolve works under -WhatIf'

# --- non-admin: HKLM skipped, HKCU applied, partial state reported
$script:Backend = New-FakeRegistry $false
$r = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'Recall')
Check ($r.Changed -eq 1 -and $r.Skipped.Count -eq 2) 'non-admin: HKCU only'
Check ((Get-AuroraTweakState (Resolve-AuroraTweaks 'Recall')[0]).State -eq 'Partly blocked') 'partial state shown'
Check (@($script:Backend.Store.Keys | Where-Object { $_ -like 'HKLM*' }).Count -eq 0) 'no HKLM writes without admin'

Remove-Item -Recurse -Force $script:Backend.DataDir -ErrorAction SilentlyContinue
$script:Backend = $null
Write-Host "$script:pass passed, $script:fail failed"
if ($script:fail -gt 0) { exit 1 }
