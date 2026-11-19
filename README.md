# Vorynth Settings (formerly Aurora Settings)

> **Rebrand:** Vorynth OS is now **Vorynth OS** (v73), with a new V logo, boot splash, login screen and premium look. The Settings app keeps its code and file names for now; its Vorynth OS pages (Add-ons) use the new `vorynth-*` commands.


An original Settings app for Windows 11 (also runs on Linux). It is not derived from Microsoft code. It does what the Windows Settings app does, adds a lot more, and lets you turn off the parts of Windows you do not want.

## Turn off the Microsoft extras

- **De-AI Windows**: switch Copilot, Recall, Click to Do, the Edge AI sidebar and AI web search off in one click, or back on whenever you like.
- **Turn off Microsoft features**: the AI and background features that use up RAM and CPU (Copilot, Recall, Widgets, Edge running in the background, Store apps in the background), plus lock screen ads, tips, suggestions, OneDrive nags, error reports, online speech, typing data and Edge promotions. Telemetry is a separate switch because Windows asks for permission.
- Every switch can be turned back on. Most changes are per user, so they need no administrator rights. Where Windows blocks a per-user change, Vorynth asks for one permission prompt and checks that the change really happened.
- Home and Pro editions of Windows always send a basic "required" level of diagnostic data. No app can remove that.

## Also included

- Vorynth Doctor: scans the PC part by part (graphics, CPU, memory, drives, network, display, audio, Windows) and fixes what it can, with a restore point first.
- Windows basics: System, Bluetooth and devices, Network, Personalization, Start and Taskbar, Apps, Gaming, Accessibility, Time and language, Privacy, Accounts, Windows Update.
- Mouse pointer fix for a vanishing pointer.
- Diagnostics: one report file with your Windows version, permissions and any errors, for bug reports.
- Ctrl+K search across every setting.
- Optional add-ons you switch on under **Add-ons**: PC health tools (disk map, duplicate finder, backup), prayer times and Hijri date, zakat calculator, world clock, colour picker, exchange rates, profiles and automation, your own commands, themes.

Only the essentials are on at first. Everything else is an add-on you can switch on or off.

## New in 1.39

- **Vorynth Store, redesigned**: a hero with live stats, popular picks, sort and grid/list views, status badges, loading skeletons, a batch **Update all** with progress, and `/` to search. Update checks are faster (4 apps at a time), tell you when GitHub is rate-limiting instead of saying "everything is up to date", and a manual check always sees the newest versions. Updating a portable app can no longer destroy the working copy if the update fails. A finished update disappears from the Updates list immediately.
- **Vorynth is more robust**: a full disk or a permissions error during a download is now reported instead of crashing the app, a background update check can no longer wipe an update you have already downloaded, and the update-download timer no longer leaks when a download fails.
- **De-AI is more complete (built in)**: one new switch turns off AI in Paint (Cocreator, Generative fill, Image creator) and Notepad (Rewrite) and locks Recall off for everyone on the PC (one permission prompt). The Edge switch now also stops Copilot reading the page you are viewing. All of it is part of the one-click presets. The standalone PowerShell version lives in `tools/powershell/`.
- **End-to-end encrypted Drop**: files shared over Wi-Fi are encrypted on your PC with a one-time key that lives only in the link's `#` part, so the network and anyone watching it see only unreadable data. The receiver just opens the link in a browser (the page decrypts the file on their device). Both sides can compare a short code. `tools/vorynth-decrypt.js` decrypts the same files without a browser or Vorynth. (A person who can change traffic on your network could alter the page, so share links only with people you trust.)
- **Lock a file with a password** (Toolkit): scrypt + ChaCha20-Poly1305, detects any change to the file, never overwrites your original.
- **Bluetooth audio & LDAC**: on Linux you can switch between LDAC, aptX and standard modes. On Windows, which cannot do LDAC at all, the page lists your Bluetooth audio devices and explains your real options. LDAC switching has not been tried with real headphones.
- **New add-ons**: Bluetooth codec guide, audio size calculator, timestamp tools, password meter, text statistics, JWT decoder and percentage calculator. Every one of the 243 add-ons is now tested by running it in a browser, and four add-on id clashes (where two add-ons overwrote each other) were fixed.

## Tests

    npm test           # unit tests (Store, updater, encryption, Drop, Bluetooth, add-ons, settings)
    npm run test:ui    # UI tests in headless Chromium (needs Playwright)
    npm run test:e2e   # launches the real Electron app and visits every page (Linux: xvfb-run)

Set `AURORA_GITHUB_TOKEN` to a GitHub token if the Store reports it is being rate-limited.

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
