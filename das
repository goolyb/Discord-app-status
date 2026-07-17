#!/usr/bin/env bash
# discord-app-status control CLI
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

PIDFILE="$HERE/.das.pid"
LOG="$HERE/das.log"
EXT="focused-window-dbus@flexagoon.com"
AUTOSTART="$HOME/.config/autostart/discord-app-status.desktop"

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  local n
  n=$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)
  [ -n "$n" ] && echo "$n" && return
  echo ""
}

running_pid() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    cat "$PIDFILE"; return 0
  fi
  pgrep -f "node .*$HERE/index.js" | head -1 || true
}

cmd_setup() {
  local id="${1:-}"
  if [ -z "$id" ]; then
    read -rp "Enter your Discord Application (client) ID: " id
  fi
  id="$(echo "$id" | tr -cd '0-9')"
  if [ -z "$id" ]; then echo "Invalid ID."; exit 1; fi
  printf '%s' "$id" > "$HERE/client-id.txt"
  echo "Saved. Client ID: $id"
  echo "Now run: ./das start"
}

cmd_start() {
  [ -f "$HERE/client-id.txt" ] || { echo "No client ID. Run: ./das setup"; exit 1; }
  if [ -n "$(running_pid)" ]; then echo "Already running (pid $(running_pid))."; exit 0; fi

  # ensure GNOME focused-window extension is enabled
  if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions enable "$EXT" 2>/dev/null || true
  fi

  # link snap Discord IPC socket to standard path if needed
  local snap="$XDG_RUNTIME_DIR/snap.discord/discord-ipc-0"
  local std="$XDG_RUNTIME_DIR/discord-ipc-0"
  [ -S "$snap" ] && [ ! -e "$std" ] && ln -sf "$snap" "$std" 2>/dev/null || true

  local NODE; NODE="$(find_node)"
  [ -n "$NODE" ] || { echo "node not found. Install Node.js."; exit 1; }

  setsid nohup "$NODE" "$HERE/index.js" > "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  disown || true
  sleep 3
  if [ -n "$(running_pid)" ]; then
    echo "Started (pid $(cat "$PIDFILE")). Logs: ./das logs"
  else
    echo "Failed to start. Check: ./das logs"; tail -5 "$LOG" 2>/dev/null || true
  fi
}

cmd_stop() {
  local p; p="$(running_pid)"
  if [ -z "$p" ]; then echo "Not running."; else
    pkill -f "node .*$HERE/index.js" 2>/dev/null || kill "$p" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "Stopped."
  fi
}

cmd_status() {
  local p; p="$(running_pid)"
  if [ -n "$p" ]; then
    echo "● running (pid $p)"
    tail -1 "$LOG" 2>/dev/null | sed 's/^/  last: /' || true
  else
    echo "○ stopped"
  fi
}

cmd_logs() { tail -n "${1:-30}" -f "$LOG"; }

cmd_enable_autostart() {
  mkdir -p "$(dirname "$AUTOSTART")"
  cat > "$AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=Discord App Status
Comment=Shows current focused app in Discord status
Exec=$HERE/das start
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=10
NoDisplay=true
EOF
  echo "Autostart enabled (starts on login)."
}

cmd_disable_autostart() { rm -f "$AUTOSTART"; echo "Autostart disabled."; }

case "${1:-}" in
  setup)             shift; cmd_setup "${1:-}";;
  start)             cmd_start;;
  stop)              cmd_stop;;
  restart)           cmd_stop; sleep 1; cmd_start;;
  status)            cmd_status;;
  logs)              shift; cmd_logs "${1:-30}";;
  enable-autostart)  cmd_enable_autostart;;
  disable-autostart) cmd_disable_autostart;;
  *)
    cat <<EOF
discord-app-status — show your focused app in Discord

Usage: ./das <command>

  setup [ID]          set your Discord Application ID (asks if omitted)
  start               start the integration
  stop                stop the integration
  restart             restart it
  status              is it running?
  logs [N]            follow the log (last N lines)
  enable-autostart    run automatically on login
  disable-autostart   don't run on login

First time:  ./das setup   then   ./das start
EOF
    ;;
esac
