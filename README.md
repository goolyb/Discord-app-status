# Discord App Status

Shows the app you're currently focused on as your Discord status — with the app's real icon pulled straight from your system. Built for GNOME on Wayland.

Instead of Discord's per-game detection, this reads your focused window via a GNOME Shell extension and updates your Rich Presence, e.g. `In Firefox`, `In Terminal`, `In Ghidra` — each with its own icon.

## How it works

- A GNOME Shell extension exposes the focused window over D-Bus.
- `index.js` polls it and updates Discord Rich Presence over the local RPC socket.
- Icons are resolved **from your PC first** (system icon theme / `.desktop` files), uploaded to a public host, and passed to Discord as an external image URL. Apps without a local icon fall back to a public icon CDN.

## Requirements

- GNOME on Wayland (or X11)
- [Node.js](https://nodejs.org) 18+
- Python 3 with PyGObject (`python3-gi`, usually preinstalled on GNOME)
- The [Focused Window D-Bus](https://extensions.gnome.org/extension/5592/focused-window-d-bus/) GNOME extension
- Discord running (desktop app)

## Setup

1. **Install the GNOME extension** — open the [Focused Window D-Bus](https://extensions.gnome.org/extension/5592/focused-window-d-bus/) page and toggle it on (or install via the Extensions app). Log out/in if it doesn't activate.

2. **Create a Discord application** — go to the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application**, and copy the **Application ID** from *General Information*.

3. **Install and configure:**
   ```bash
   git clone git@github.com:goolyb/Discord-app-status.git
   cd Discord-app-status
   npm install
   ./das setup        # paste your Application ID
   ./das start
   ```

4. **In Discord:** User Settings → **Activity Privacy** → enable *Share your detected activities with others*. Make sure your status isn't Invisible.

## Usage

```
./das setup [ID]        set your Discord Application ID (asks if omitted)
./das start             start the integration
./das stop              stop the integration
./das restart           restart it
./das status            is it running? + current window
./das logs [N]          follow the log
./das enable-autostart  run automatically on login
./das disable-autostart don't run on login
```

## Customizing icons

Names and icon overrides live in `config.json`:

- **`nameMap`** — map a window class to a nicer display name (`"org.gnome.Ptyxis": "Terminal"`).
- **`iconOverride`** — pin a specific icon for an app. Matched by substring of the window class, so `"ghidra"` catches `ghidraRun-Ghidra` too. Value can be:
  - a URL: `"ghidra": "https://.../ghidra.png"`
  - a local file: `"discord": "icons/discord.png"`

Custom PNGs (e.g. a recolored terminal icon) go in `icons/`.

If an app shows the wrong icon or none, add it to `iconOverride`. To force a refresh, delete its entry from `icon-cache.json`.

## Notes

- Your Application ID is stored in `client-id.txt` (git-ignored), not in `config.json`.
- Icon URLs are hosted on a free temporary host and auto-refreshed before they expire, so regularly-used apps keep working without intervention.
