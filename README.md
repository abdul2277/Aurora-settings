# Aurora-settings
Aurora settings to quickly de-bloat Windows AI features. You can undo every change with one command.

## Quick start
1. Download this repository (Code → Download ZIP) and extract it.
2. Double-click **`Aurora.cmd`**. It asks for administrator rights and opens the menu.
3. Press **R** to apply the recommended set, or **P** to preview it first without changing anything.

```
  1. *Windows Copilot                Off (blocked)   3/3
  2. *Recall snapshots               Off (blocked)   3/3
  3. *Click to Do                    On (default)    0/2
  ...
  [R] Apply recommended   [A] Apply all   [1-9] Apply one (e.g. 1,3,5)
  [P] Preview recommended (no changes)   [U] Undo last run   [C] Remove Copilot app   [Q] Quit
```

## What it turns off
| Id | Feature | Recommended | How |
|---|---|:-:|---|
| `Copilot` | Windows Copilot + taskbar button | ✔ | `TurnOffWindowsCopilot` policy, `ShowCopilotButton=0` |
| `Recall` | Recall screen snapshots | ✔ | `DisableAIDataAnalysis`, `AllowRecallEnablement=0` |
| `ClickToDo` | Click to Do | ✔ | `DisableClickToDo` policy |
| `Paint` | Cocreator, Generative fill, Image creator | ✔ | Paint policies |
| `Notepad` | Rewrite / AI in Notepad | ✔ | `DisableAIFeatures` policy |
| `Edge` | Copilot sidebar in Edge, page-content access | ✔ | `HubsSidebarEnabled=0`, `CopilotPageContext=0` |
| `BingSearch` | Bing web results in Start search | ✔ | `DisableSearchBoxSuggestions`, `BingSearchEnabled=0` |
| `TypingInsights` | Typing & inking data collection | | `InputPersonalization` settings |
| `Ads` | Advertising ID & tailored experiences | | `AdvertisingInfo`, `CloudContent` policy |

Optional: **Remove Copilot app** (menu **C** or `-RemoveCopilotApp`) uninstalls the Copilot Store app. You can reinstall it from the Microsoft Store.

## Command line
```powershell
.\Aurora.ps1 -Status                        # what is on/off
.\Aurora.ps1 -List                          # ids and descriptions
.\Aurora.ps1 -Apply Recommended -WhatIf     # preview only
.\Aurora.ps1 -Apply Recommended -RestorePoint
.\Aurora.ps1 -Apply Recall,Copilot,Edge
.\Aurora.ps1 -Undo                          # roll back the latest run
.\Aurora.ps1 -Undo -BackupFile <path>       # roll back a specific run
```
Add `-NoExplorerRestart` to skip restarting Explorer.

## Safety
- **Exact undo**: before each run, Aurora saves the old values to `%LOCALAPPDATA%\Aurora\backups\aurora-<time>.json`. Undo puts them back, and deletes any value that did not exist before.
- **Preview**: `-WhatIf` (or menu **P**) lists every change and touches nothing.
- **Restore point**: `-RestorePoint` creates a System Restore point first.
- **Without administrator rights**: per-user (HKCU) settings are still applied. Machine-wide (HKLM) policies are skipped and listed, and those features show as *Partly blocked*.
- **Re-running is safe**: settings already applied are left alone.
- It uses only documented registry policies and settings. It removes no system files and does not edit the hosts file. Some changes take effect after signing out or restarting the app.

## Tests
```
pwsh -File tests/Aurora.Tests.ps1      # or: powershell -File tests\Aurora.Tests.ps1
```
87 checks run against an in-memory registry. They cover apply, idempotence, exact undo, WhatIf, non-admin behaviour and the catalog.
