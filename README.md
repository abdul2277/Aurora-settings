# Aurora Settings

An original Settings app for Windows 11 (also runs on Linux). It is not derived from Microsoft code. It does what the Windows Settings app does, adds a lot more, and lets you turn off the parts of Windows you do not want.

## Turn off the Microsoft extras

- **De-AI Windows**: switch Copilot, Recall, Click to Do, the Edge AI sidebar and AI web search off in one click, or back on whenever you like.
- **Turn off Microsoft features**: the AI and background features that use up RAM and CPU (Copilot, Recall, Widgets, Edge running in the background, Store apps in the background), plus lock screen ads, tips, suggestions, OneDrive nags, error reports, online speech, typing data and Edge promotions. Telemetry is a separate switch because Windows asks for permission.
- Every switch can be turned back on. Most changes are per user, so they need no administrator rights. Where Windows blocks a per-user change, Aurora asks for one permission prompt and checks that the change really happened.
- Home and Pro editions of Windows always send a basic "required" level of diagnostic data. No app can remove that.

## Also included

- Aurora Doctor: scans the PC part by part (graphics, CPU, memory, drives, network, display, audio, Windows) and fixes what it can, with a restore point first.
- Windows basics: System, Bluetooth and devices, Network, Personalization, Start and Taskbar, Apps, Gaming, Accessibility, Time and language, Privacy, Accounts, Windows Update.
- Mouse pointer fix for a vanishing pointer.
- Diagnostics: one report file with your Windows version, permissions and any errors, for bug reports.
- Ctrl+K search across every setting.
- Optional add-ons you switch on under **Add-ons**: PC health tools (disk map, duplicate finder, backup), prayer times and Hijri date, zakat calculator, world clock, colour picker, exchange rates, profiles and automation, your own commands, themes.

Only the essentials are on at first. Everything else is an add-on you can switch on or off.

## New in 1.39

- **Aurora Store, redesigned**: a hero with live stats, popular picks, sort and grid/list views, status badges, loading skeletons, a batch **Update all** with progress, and `/` to search. Update checks are faster (4 apps at a time), tell you when GitHub is rate-limiting instead of saying "everything is up to date", and a manual check always sees the newest versions. Updating a portable app can no longer destroy the working copy if the update fails. A finished update disappears from the Updates list immediately.
- **Aurora is more robust**: a full disk or a permissions error during a download is now reported instead of crashing the app, a background update check can no longer wipe an update you have already downloaded, and the update-download timer no longer leaks when a download fails.
- **De-AI is more complete (built in)**: one new switch turns off AI in Paint (Cocreator, Generative fill, Image creator) and Notepad (Rewrite) and locks Recall off for everyone on the PC (one permission prompt). The Edge switch now also stops Copilot reading the page you are viewing. All of it is part of the one-click presets. The standalone PowerShell version lives in `tools/powershell/`.
- **End-to-end encrypted Drop**: files shared over Wi-Fi are encrypted on your PC with a one-time key that lives only in the link's `#` part, so the network and anyone watching it see only unreadable data. The receiver just opens the link in a browser (the page decrypts the file on their device). Both sides can compare a short code. `tools/aurora-decrypt.js` decrypts the same files without a browser or Aurora. (A person who can change traffic on your network could alter the page, so share links only with people you trust.)
- **Lock a file with a password** (Toolkit): scrypt + ChaCha20-Poly1305, detects any change to the file, never overwrites your original.
- **Bluetooth audio & LDAC**: on Linux you can switch between LDAC, aptX and standard modes. On Windows, which cannot do LDAC at all, the page lists your Bluetooth audio devices and explains your real options. LDAC switching has not been tried with real headphones.
- **New add-ons**: Bluetooth codec guide, audio size calculator, timestamp tools, password meter, text statistics, JWT decoder and percentage calculator. Every one of the 243 add-ons is now tested by running it in a browser, and four add-on id clashes (where two add-ons overwrote each other) were fixed.

## Tests

    npm test           # unit tests (Store, updater, encryption, Drop, Bluetooth, add-ons, settings)
    npm run test:ui    # UI tests in headless Chromium (needs Playwright)
    npm run test:e2e   # launches the real Electron app and visits every page (Linux: xvfb-run)

Set `AURORA_GITHUB_TOKEN` to a GitHub token if the Store reports it is being rate-limited.

## New in 1.44

- **Eight more add-ons** (257 in all, every one run in a browser by the tests): **Days until** (countdowns that you can keep), **Meeting time planner** (finds the hours that work across time zones), **Team splitter** (fair random teams), **Dice and coin** (like 2d6+3), **BMI calculator**, **Trip cost calculator**, **Markdown table maker** (from spreadsheet cells or CSV) and **Number to words** (for cheques and forms).

## New in 1.43

- **Time of day, everywhere it helps**: the Home greeting and emoji follow the day (🌅 Early start, ☀️ Good morning, 🌤️ Good afternoon, 🌆 Good evening, 🌙 Good night) and update by themselves.
- **"Right now" card on Home**: one idea that fits the moment (check for app updates in the morning, send a file privately in the evening, a darker theme late at night), with a button that opens it. It rotates daily.
- **Theme that follows the clock** (Looks page): Sunset at dawn, Gold in the morning, Ocean in the afternoon, Violet in the evening, Midnight at night. Off by default.

## New in 1.42

- **Welcome tour**: five short, skippable steps with the Aurora logo, shown once. Bring it back any time with `tour` in Ctrl+K.
- **Safety net**: the old error handler wrote its log inside the app's own folder (not writable once installed) and showed the raw error, including your Windows user name, in a dialog for every error. Errors are now saved under your user data (user name removed, newest 20 kept), you see one friendly message at a time, and there is a **Copy report** button.

## New in 1.41

- **Store collections**: six one-click bundles (Everyday essentials, Developer kit, Creator studio, Privacy pack, Gamer pack, PC health tools) that install only what you are missing. **Export my apps** saves your list, and **Import a list** reinstalls it on another PC (hostile or malformed lists are rejected).
- **Drop, more flexible**: share several files or a whole folder (zipped, then encrypted), and a new **Receive** mode where a phone or another PC uploads files to your Downloads folder under "Aurora Drop". Receiving is NOT encrypted, so it says so, has size and count limits, never overwrites, and stops by itself after 15 minutes.
- **Ten new themes** (16 in all), each checked for readable contrast.
- **Right-to-left layout** for Arabic and other RTL languages: the whole interface mirrors, and every page is tested for sideways overflow. This also fixed an old overflow on the Add-ons page.
- **Aurora Doctor, new checks**: clock drift (with a one-click time sync), how old the last Windows update is, other drives running low, Secure Boot, TPM, User Account Control turned off, Remote Desktop enabled, and a big Recycle Bin. The PowerShell for these has not run on real Windows; it passes PowerShell's own parser and the logic is unit tested.

## New in 1.40

- Six more add-ons: Download time calculator, Cron explainer (plain words plus the next five runs), Tip and split calculator, Text case converter (Arabic friendly), Sleep cycle calculator, Aspect ratio calculator. All 249 add-ons are run in a browser by the tests.

## Run it

1. Install Node.js LTS from https://nodejs.org
2. In this folder run:

       npm install
       npm start

On Windows you can also double-click `start.bat`.

## Build

       npm run build          # Windows portable .exe in dist/
       npm run build:linux    # Linux AppImage

## Notes

- Nothing is sent anywhere. All settings and tools run on your PC.
- Registry changes use the same keys and policies Windows documents. Taskbar and File Explorer changes restart Explorer for a second.
- The Windows-only parts need a real Windows PC to take effect. On Linux the app shows only the pages that work there.
- Downloaded builds are not code-signed, so Windows SmartScreen may warn. Unblock the zip (Properties, Unblock) before extracting.
- Licensed under the MIT License (see LICENSE).
