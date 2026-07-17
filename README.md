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

## Notes

- Your Application ID is stored in `client-id.txt` (git-ignored), not in `config.json`.
- Icon URLs are hosted on a free temporary host and auto-refreshed before they expire, so regularly-used apps keep working without intervention.
