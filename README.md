# Discord App Status

Shows the app you're currently focused on as your Discord status — with the app's real icon pulled straight from your system. Works on **Linux (GNOME)** and **Windows**.

Instead of Discord's per-game detection, this reads your focused window and updates your Rich Presence, e.g. `In Firefox`, `In Terminal`, `In Ghidra` — each with its own icon.

## How it works

- **Linux:** a GNOME Shell extension exposes the focused window over D-Bus; icons come from your system icon theme / `.desktop` files.
- **Windows:** the foreground window and its `.exe` are read via PowerShell; the icon is extracted from the executable.
- The icon is uploaded to a public host and passed to Discord as an external image URL. Apps without a local icon fall back to a public icon CDN.

## Requirements

- [Node.js](https://nodejs.org) 18+
- Discord running (desktop app)
- **Linux only:** GNOME on Wayland/X11, Python 3 with PyGObject (`python3-gi`), and the [Focused Window D-Bus](https://extensions.gnome.org/extension/5592/focused-window-d-bus/) GNOME extension
- **Windows only:** PowerShell (built in)

## Setup

**Create a Discord application** (both platforms): go to the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application**, and copy the **Application ID** from *General Information*.

Then, in Discord: User Settings → **Activity Privacy** → enable *Share your detected activities with others*, and make sure your status isn't Invisible.

### Linux

1. Install the [Focused Window D-Bus](https://extensions.gnome.org/extension/5592/focused-window-d-bus/) extension and enable it (log out/in if it doesn't activate).
2. Install and run:
   ```bash
   git clone git@github.com:goolyb/Discord-app-status.git
   cd Discord-app-status
   npm install
   ./das setup        # paste your Application ID
   ./das start
   ```

### Windows

```powershell
git clone https://github.com/goolyb/Discord-app-status.git
cd Discord-app-status
npm install
.\das.ps1 setup       # paste your Application ID
.\das.ps1 start
```
> If scripts are blocked, run PowerShell once as: `powershell -ExecutionPolicy Bypass -File .\das.ps1 start`

## Usage

Linux uses `./das <cmd>`, Windows uses `.\das.ps1 <cmd>`. Same commands:

```
setup [ID]          set your Discord Application ID (asks if omitted)
start               start the integration
stop                stop the integration
restart             restart it
status              is it running? + current window
logs                follow the log
enable-autostart    run automatically on login
disable-autostart   don't run on login
```

## Customizing icons

Names and icon overrides live in `config.json`:

- **`nameMap`** — map a window class / process name to a nicer display name.
- **`iconOverride`** — pin a specific icon for an app. Matched by substring, so `"ghidra"` catches `ghidraRun-Ghidra` too. Value can be a URL (`"ghidra": "https://.../ghidra.png"`) or a local file (`"discord": "icons/discord.png"`).

If an app shows the wrong icon or none, add it to `iconOverride`. To force a refresh, delete its entry from `icon-cache.json`.

## Showing the current website

Optionally, when a browser is focused the status also shows the active tab's domain (e.g. `FIREFOX` with `youtube.com` underneath). Works the same on **Linux and Windows**.

A tiny bundled WebExtension reports the active tab's URL to a local receiver the script runs on `127.0.0.1:6060` (the receiver starts automatically with `das`/`das.ps1` on both platforms). Only the hostname is used; internal pages (`about:`, `chrome://`, `file:`, …) are ignored, and stale URLs older than 30s are dropped. This works even for sandboxed browsers (e.g. snap Firefox, where remote debugging and the accessibility bus are blocked).

Two builds are provided:
- **`firefox-ext/`** — for Firefox and **Zen** (a Firefox fork).
- **`chrome-ext/`** — for Chrome, Chromium, Brave and Edge (Manifest V3).

### Chrome / Chromium / Brave / Edge

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** → select the `chrome-ext/` folder.

Persists across restarts, no signing needed.

### Firefox / Zen

Firefox release builds only install signed extensions, so sign it once against your own [addons.mozilla.org API key](https://addons.mozilla.org/developers/addon/api/key/):

```bash
cd firefox-ext
npx web-ext sign --channel=unlisted --api-key=YOUR_KEY --api-secret=YOUR_SECRET
```

This produces a signed `.xpi` in `firefox-ext/web-ext-artifacts/`. Then in Firefox/Zen open `about:addons` → gear ⚙️ → **Install Add-on From File…** → pick the `.xpi`.

For a quick test without signing, load it temporarily via `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `firefox-ext/manifest.json` (dropped on browser restart).

### Config

- **`urlPort`** — port of the local URL receiver (default `6060`).
- **`urlMaxAgeSeconds`** — ignore reported URLs older than this (default `30`).

## Notes

- Your Application ID is stored in `client-id.txt` (git-ignored), not in `config.json`.
- Presence updates are throttled to once per 15s (Discord's Rich Presence rate limit), so rapid window/tab switching won't cause the status to stall.
- Icon URLs are hosted on a free temporary host and auto-refreshed before they expire, so regularly-used apps keep working without intervention.
