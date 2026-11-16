<#
.SYNOPSIS
    Aurora - quickly turn off Windows AI features (Copilot, Recall, Click to Do,
    AI in Paint/Notepad/Edge, Bing in Start, typing insights...) and undo it later.

.DESCRIPTION
    Every change is a documented registry policy/setting. Before changing anything,
    Aurora saves the previous values to %LOCALAPPDATA%\Aurora\backups so -Undo restores
    exactly what was there (including deleting values that did not exist before).

.EXAMPLE
    .\Aurora.ps1                      # interactive menu
    .\Aurora.ps1 -Status              # show what is on/off
    .\Aurora.ps1 -Apply All -WhatIf   # preview every change, touch nothing
    .\Aurora.ps1 -Apply Recall,Copilot
    .\Aurora.ps1 -Apply Recommended -RestorePoint
    .\Aurora.ps1 -Undo                # roll back the latest Aurora run
    .\Aurora.ps1 -List
#>
[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = 'Menu')]
param(
    [Parameter(ParameterSetName = 'Status')] [switch] $Status,
    [Parameter(ParameterSetName = 'List')]   [switch] $List,
    [Parameter(ParameterSetName = 'Apply')]  [string[]] $Apply,
    [Parameter(ParameterSetName = 'Undo')]   [switch] $Undo,
    [Parameter(ParameterSetName = 'Undo')]   [string] $BackupFile,
    [Parameter(ParameterSetName = 'Apply')]  [switch] $RestorePoint,
    [Parameter(ParameterSetName = 'Apply')]  [switch] $RemoveCopilotApp,
    [switch] $NoExplorerRestart,
    [switch] $NoRun   # load functions only (used by tests)
)

Set-StrictMode -Version 2.0
$script:AuroraVersion = '1.0.0'

# --------------------------------------------------------------------------
# Catalog of tweaks. Each setting: Hive (HKCU/HKLM), Path, Name, Value (DWORD).
# Recommended = safe for almost everyone; others are opt-in privacy extras.
# --------------------------------------------------------------------------
function Get-AuroraCatalog {
    $p = 'Software\Policies\Microsoft\Windows'
    @(
        [pscustomobject]@{ Id = 'Copilot'; Name = 'Windows Copilot'; Recommended = $true
            Description = 'Turns off Windows Copilot through policy and hides its taskbar button.'
            Settings = @(
                @{ Hive = 'HKCU'; Path = "$p\WindowsCopilot"; Name = 'TurnOffWindowsCopilot'; Value = 1 },
                @{ Hive = 'HKLM'; Path = "$p\WindowsCopilot"; Name = 'TurnOffWindowsCopilot'; Value = 1 },
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'; Name = 'ShowCopilotButton'; Value = 0 }) }
        [pscustomobject]@{ Id = 'Recall'; Name = 'Recall snapshots'; Recommended = $true
            Description = 'Stops Recall from saving screen snapshots and blocks enabling it.'
            Settings = @(
                @{ Hive = 'HKCU'; Path = "$p\WindowsAI"; Name = 'DisableAIDataAnalysis'; Value = 1 },
                @{ Hive = 'HKLM'; Path = "$p\WindowsAI"; Name = 'DisableAIDataAnalysis'; Value = 1 },
                @{ Hive = 'HKLM'; Path = "$p\WindowsAI"; Name = 'AllowRecallEnablement'; Value = 0 }) }
        [pscustomobject]@{ Id = 'ClickToDo'; Name = 'Click to Do'; Recommended = $true
            Description = 'Turns off Click to Do (AI actions on screen content).'
            Settings = @(
                @{ Hive = 'HKCU'; Path = "$p\WindowsAI"; Name = 'DisableClickToDo'; Value = 1 },
                @{ Hive = 'HKLM'; Path = "$p\WindowsAI"; Name = 'DisableClickToDo'; Value = 1 }) }
        [pscustomobject]@{ Id = 'Paint'; Name = 'AI in Paint'; Recommended = $true
            Description = 'Turns off Cocreator, Generative fill and Image creator in Paint.'
            Settings = @(
                @{ Hive = 'HKLM'; Path = 'Software\Microsoft\Windows\CurrentVersion\Policies\Paint'; Name = 'DisableCocreator'; Value = 1 },
                @{ Hive = 'HKLM'; Path = 'Software\Microsoft\Windows\CurrentVersion\Policies\Paint'; Name = 'DisableGenerativeFill'; Value = 1 },
                @{ Hive = 'HKLM'; Path = 'Software\Microsoft\Windows\CurrentVersion\Policies\Paint'; Name = 'DisableImageCreator'; Value = 1 }) }
        [pscustomobject]@{ Id = 'Notepad'; Name = 'AI in Notepad'; Recommended = $true
            Description = 'Turns off Rewrite and other AI features in Notepad.'
            Settings = @(
                @{ Hive = 'HKLM'; Path = 'Software\Policies\WindowsNotepad'; Name = 'DisableAIFeatures'; Value = 1 }) }
        [pscustomobject]@{ Id = 'Edge'; Name = 'Copilot in Edge'; Recommended = $true
            Description = 'Hides the Edge sidebar (Copilot) and stops it reading page content.'
            Settings = @(
                @{ Hive = 'HKLM'; Path = 'Software\Policies\Microsoft\Edge'; Name = 'HubsSidebarEnabled'; Value = 0 },
                @{ Hive = 'HKLM'; Path = 'Software\Policies\Microsoft\Edge'; Name = 'CopilotPageContext'; Value = 0 }) }
        [pscustomobject]@{ Id = 'BingSearch'; Name = 'Bing in Start search'; Recommended = $true
            Description = 'Keeps Start menu search local: no Bing web results or suggestions.'
            Settings = @(
                @{ Hive = 'HKCU'; Path = "$p\Explorer"; Name = 'DisableSearchBoxSuggestions'; Value = 1 },
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\Windows\CurrentVersion\Search'; Name = 'BingSearchEnabled'; Value = 0 }) }
        [pscustomobject]@{ Id = 'TypingInsights'; Name = 'Typing & inking data'; Recommended = $false
            Description = 'Stops collecting typing/inking samples used to personalise text prediction.'
            Settings = @(
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\Input\TIPC'; Name = 'Enabled'; Value = 0 },
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\InputPersonalization'; Name = 'RestrictImplicitTextCollection'; Value = 1 },
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\InputPersonalization'; Name = 'RestrictImplicitInkCollection'; Value = 1 }) }
        [pscustomobject]@{ Id = 'Ads'; Name = 'Ad ID & tailored experiences'; Recommended = $false
            Description = 'Turns off the advertising ID and tips/ads based on diagnostic data.'
            Settings = @(
                @{ Hive = 'HKCU'; Path = 'Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo'; Name = 'Enabled'; Value = 0 },
                @{ Hive = 'HKCU'; Path = "$p\CloudContent"; Name = 'DisableTailoredExperiencesWithDiagnosticData'; Value = 1 }) }
    )
}

# --------------------------------------------------------------------------
# Registry access goes through these functions so tests can swap the backend.
# --------------------------------------------------------------------------
$script:Backend = $null   # $null = real registry; tests assign a hashtable-backed object

function Get-RegPath([string] $Hive, [string] $Path) { "Registry::$(if ($Hive -eq 'HKLM') { 'HKEY_LOCAL_MACHINE' } else { 'HKEY_CURRENT_USER' })\$Path" }

function Read-AuroraValue([string] $Hive, [string] $Path, [string] $Name) {
    if ($script:Backend) { return $script:Backend.Read($Hive, $Path, $Name) }
    $item = Get-ItemProperty -LiteralPath (Get-RegPath $Hive $Path) -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $null }
    return $item.$Name
}

function Write-AuroraValue([string] $Hive, [string] $Path, [string] $Name, [int] $Value) {
    if ($script:Backend) { $script:Backend.Write($Hive, $Path, $Name, $Value); return }
    $full = Get-RegPath $Hive $Path
    if (-not (Test-Path -LiteralPath $full)) { New-Item -Path $full -Force | Out-Null }
    New-ItemProperty -LiteralPath $full -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
}

function Remove-AuroraValue([string] $Hive, [string] $Path, [string] $Name) {
    if ($script:Backend) { $script:Backend.Remove($Hive, $Path, $Name); return }
    Remove-ItemProperty -LiteralPath (Get-RegPath $Hive $Path) -Name $Name -ErrorAction SilentlyContinue
}

function Test-AuroraAdmin {
    if ($script:Backend) { return $script:Backend.IsAdmin }
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Get-AuroraDataDir {
    if ($script:Backend -and $script:Backend.DataDir) { return $script:Backend.DataDir }
    $base = $env:LOCALAPPDATA
    if (-not $base) { $base = [IO.Path]::GetTempPath() }
    return (Join-Path $base 'Aurora')
}

# --------------------------------------------------------------------------
# Core logic
# --------------------------------------------------------------------------
function Resolve-AuroraTweaks([string[]] $Names) {
    $catalog = Get-AuroraCatalog
    $picked = New-Object System.Collections.ArrayList
    foreach ($raw in $Names) {
        foreach ($n in ($raw -split ',')) {
            $n = $n.Trim()
            if (-not $n) { continue }
            if ($n -eq 'All') { $catalog | ForEach-Object { [void]$picked.Add($_) }; continue }
            if ($n -eq 'Recommended') { $catalog | Where-Object Recommended | ForEach-Object { [void]$picked.Add($_) }; continue }
            $match = $catalog | Where-Object { $_.Id -eq $n }
            if (-not $match) { throw "Unknown tweak '$n'. Use -List to see the ids (or All / Recommended)." }
            [void]$picked.Add($match)
        }
    }
    # de-duplicate, keep catalog order
    $ids = @($picked | ForEach-Object { $_.Id })
    return @($catalog | Where-Object { $ids -contains $_.Id })
}

function Get-AuroraTweakState($Tweak) {
    $isAdmin = Test-AuroraAdmin
    $done = 0; $total = 0
    foreach ($s in $Tweak.Settings) {
        $total++
        $v = Read-AuroraValue $s.Hive $s.Path $s.Name
        if ($null -ne $v -and [int]$v -eq $s.Value) { $done++ }
    }
    $state = if ($done -eq $total) { 'Off (blocked)' } elseif ($done -eq 0) { 'On (default)' } else { 'Partly blocked' }
    [pscustomobject]@{ Id = $Tweak.Id; Feature = $Tweak.Name; State = $state; Applied = "$done/$total"; Recommended = $Tweak.Recommended }
}

function Get-AuroraStatus { Get-AuroraCatalog | ForEach-Object { Get-AuroraTweakState $_ } }

function Invoke-AuroraApply {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([object[]] $Tweaks)
    $isAdmin = Test-AuroraAdmin
    $backup = New-Object System.Collections.ArrayList
    $changed = 0; $skipped = New-Object System.Collections.ArrayList
    foreach ($t in $Tweaks) {
        foreach ($s in $t.Settings) {
            if ($s.Hive -eq 'HKLM' -and -not $isAdmin) {
                [void]$skipped.Add("$($t.Name): HKLM\$($s.Path)\$($s.Name) (needs administrator)")
                continue
            }
            $old = Read-AuroraValue $s.Hive $s.Path $s.Name
            if ($null -ne $old -and [int]$old -eq $s.Value) { continue }   # already set
            $target = "$($s.Hive)\$($s.Path)\$($s.Name) = $($s.Value)"
            if ($PSCmdlet.ShouldProcess($target, "Set ($($t.Name))")) {
                [void]$backup.Add([pscustomobject]@{ Tweak = $t.Id; Hive = $s.Hive; Path = $s.Path; Name = $s.Name; Existed = ($null -ne $old); Old = $old; New = $s.Value })
                Write-AuroraValue $s.Hive $s.Path $s.Name $s.Value
                $changed++
            }
        }
    }
    $file = $null
    if ($backup.Count -gt 0) { $file = Save-AuroraBackup $backup }
    [pscustomobject]@{ Changed = $changed; Skipped = @($skipped); BackupFile = $file }
}

function Save-AuroraBackup($Entries) {
    $dir = Join-Path (Get-AuroraDataDir) 'backups'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff')
    $file = Join-Path $dir "aurora-$stamp.json"
    $doc = [pscustomobject]@{ Tool = 'Aurora'; Version = $script:AuroraVersion; Created = (Get-Date).ToString('o'); Computer = $env:COMPUTERNAME; Changes = @($Entries) }
    $doc | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $file -Encoding UTF8
    return $file
}

function Get-AuroraBackups {
    $dir = Join-Path (Get-AuroraDataDir) 'backups'
    if (-not (Test-Path -LiteralPath $dir)) { return @() }
    return @(Get-ChildItem -LiteralPath $dir -Filter 'aurora-*.json' | Sort-Object Name -Descending)
}

function Invoke-AuroraUndo {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([string] $File)
    if (-not $File) {
        $latest = Get-AuroraBackups | Select-Object -First 1
        if (-not $latest) { throw 'No Aurora backup found - nothing to undo.' }
        $File = $latest.FullName
    }
    $doc = Get-Content -LiteralPath $File -Raw | ConvertFrom-Json
    if ($doc.Tool -ne 'Aurora') { throw "$File is not an Aurora backup." }
    $isAdmin = Test-AuroraAdmin
    $restored = 0; $skipped = New-Object System.Collections.ArrayList
    $changes = @($doc.Changes)
    [array]::Reverse($changes)
    foreach ($c in $changes) {
        if ($c.Hive -eq 'HKLM' -and -not $isAdmin) { [void]$skipped.Add("HKLM\$($c.Path)\$($c.Name) (needs administrator)"); continue }
        $what = "$($c.Hive)\$($c.Path)\$($c.Name)"
        if ($c.Existed) {
            if ($PSCmdlet.ShouldProcess($what, "Restore to $($c.Old)")) { Write-AuroraValue $c.Hive $c.Path $c.Name ([int]$c.Old); $restored++ }
        } else {
            if ($PSCmdlet.ShouldProcess($what, 'Remove (did not exist before Aurora)')) { Remove-AuroraValue $c.Hive $c.Path $c.Name; $restored++ }
        }
    }
    if ($skipped.Count -eq 0 -and -not $WhatIfPreference) {
        Rename-Item -LiteralPath $File -NewName ([IO.Path]::GetFileName($File) + '.undone') -ErrorAction SilentlyContinue
    }
    [pscustomobject]@{ Restored = $restored; Skipped = @($skipped); BackupFile = $File }
}

function Remove-AuroraCopilotApp {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param()
    $pkgs = @(Get-AppxPackage -Name 'Microsoft.Copilot*' -ErrorAction SilentlyContinue)
    if ($pkgs.Count -eq 0) { Write-Host '  Copilot app is not installed.'; return }
    foreach ($pkg in $pkgs) {
        if ($PSCmdlet.ShouldProcess($pkg.PackageFullName, 'Uninstall app')) {
            Remove-AppxPackage -Package $pkg.PackageFullName
            Write-Host "  Removed $($pkg.Name). Reinstall any time from the Microsoft Store."
        }
    }
}

function New-AuroraRestorePoint {
    try {
        Checkpoint-Computer -Description 'Aurora - before disabling AI features' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
        Write-Host '  System restore point created.' -ForegroundColor Green
    } catch {
        Write-Warning "Could not create a restore point ($($_.Exception.Message)). Aurora's own backup will still be saved."
    }
}

function Restart-AuroraExplorer {
    if ($NoExplorerRestart -or $script:Backend) { return }
    Write-Host '  Restarting Explorer so taskbar/search changes show up...'
    Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800
    if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
}

# --------------------------------------------------------------------------
# Presentation
# --------------------------------------------------------------------------
function Show-AuroraBanner {
    Write-Host ''
    Write-Host '   ___                            ' -ForegroundColor Cyan
    Write-Host '  / _ |__ _________  _______ _    ' -ForegroundColor Cyan
    Write-Host ' / __ / // / __/ _ \/ __/ _ `/    ' -ForegroundColor Magenta
    Write-Host '/_/ |_\_,_/_/  \___/_/  \_,_/     ' -ForegroundColor Magenta
    Write-Host "  Windows AI de-bloat  v$script:AuroraVersion" -ForegroundColor DarkGray
    if (-not (Test-AuroraAdmin)) { Write-Host '  Not running as administrator: machine-wide (HKLM) policies will be skipped.' -ForegroundColor Yellow }
    Write-Host ''
}

function Write-AuroraStatus {
    $i = 0
    foreach ($s in Get-AuroraStatus) {
        $i++
        $color = switch ($s.State) { 'Off (blocked)' { 'Green' } 'Partly blocked' { 'Yellow' } default { 'Gray' } }
        $rec = if ($s.Recommended) { '*' } else { ' ' }
        Write-Host ('  {0,2}. {1}{2,-30} {3,-15} {4}' -f $i, $rec, $s.Feature, $s.State, $s.Applied) -ForegroundColor $color
    }
    Write-Host '      * = recommended' -ForegroundColor DarkGray
}

function Write-AuroraResult($r, [string] $verb) {
    Write-Host ''
    $count = if ($r.PSObject.Properties['Changed']) { $r.Changed } else { $r.Restored }
    Write-Host "  $verb $count setting(s)." -ForegroundColor Green
    foreach ($s in $r.Skipped) { Write-Host "  Skipped: $s" -ForegroundColor Yellow }
    if ($r.BackupFile) { Write-Host "  Backup: $($r.BackupFile)" -ForegroundColor DarkGray }
    Write-Host '  Some changes apply after you sign out or restart the app (Edge, Paint, Notepad).' -ForegroundColor DarkGray
}

function Start-AuroraMenu {
    while ($true) {
        Clear-Host
        Show-AuroraBanner
        Write-AuroraStatus
        Write-Host ''
        Write-Host '  [R] Apply recommended   [A] Apply all   [1-9] Apply one (e.g. 1,3,5)'
        Write-Host '  [P] Preview recommended (no changes)   [U] Undo last run   [C] Remove Copilot app   [Q] Quit'
        $choice = (Read-Host '  Choose').Trim()
        $catalog = Get-AuroraCatalog
        try {
            switch -Regex ($choice) {
                '^[Qq]$' { return }
                '^[Rr]$' { $r = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'Recommended'); Write-AuroraResult $r 'Changed'; Restart-AuroraExplorer }
                '^[Aa]$' { $r = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'All'); Write-AuroraResult $r 'Changed'; Restart-AuroraExplorer }
                '^[Pp]$' { Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks 'Recommended') -WhatIf | Out-Null }
                '^[Uu]$' { $r = Invoke-AuroraUndo; Write-AuroraResult $r 'Restored'; Restart-AuroraExplorer }
                '^[Cc]$' { if ((Read-Host '  Uninstall the Copilot app? (y/N)') -match '^[Yy]') { Remove-AuroraCopilotApp } }
                '^[0-9, ]+$' {
                    $ids = @($choice -split '[, ]+' | Where-Object { $_ } | ForEach-Object {
                        $n = [int]$_; if ($n -lt 1 -or $n -gt $catalog.Count) { throw "No item $n." }; $catalog[$n - 1].Id })
                    $r = Invoke-AuroraApply -Tweaks (Resolve-AuroraTweaks $ids); Write-AuroraResult $r 'Changed'; Restart-AuroraExplorer
                }
                default { Write-Host '  Unknown choice.' -ForegroundColor Yellow }
            }
        } catch { Write-Host "  $($_.Exception.Message)" -ForegroundColor Red }
        Write-Host ''
        Read-Host '  Press Enter to continue' | Out-Null
    }
}

# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
if ($NoRun) { return }

switch ($PSCmdlet.ParameterSetName) {
    'Status' { Show-AuroraBanner; Write-AuroraStatus }
    'List'   { Get-AuroraCatalog | Select-Object Id, Name, Recommended, Description | Format-Table -AutoSize -Wrap }
    'Apply' {
        Show-AuroraBanner
        $tweaks = Resolve-AuroraTweaks $Apply
        if ($RestorePoint -and -not $WhatIfPreference) { New-AuroraRestorePoint }
        $r = Invoke-AuroraApply -Tweaks $tweaks
        if (-not $WhatIfPreference) { Write-AuroraResult $r 'Changed' }
        if ($RemoveCopilotApp) { Remove-AuroraCopilotApp }
        if ($r.Changed -gt 0 -and -not $WhatIfPreference) { Restart-AuroraExplorer }
    }
    'Undo' {
        Show-AuroraBanner
        $r = Invoke-AuroraUndo -File $BackupFile
        if (-not $WhatIfPreference) { Write-AuroraResult $r 'Restored'; Restart-AuroraExplorer }
    }
    default { Start-AuroraMenu }
}
