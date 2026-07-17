import { Client } from "@xhayper/discord-rpc";
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveIcon } from "./icons.mjs";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, "config.json"), "utf8"));
const isWin = process.platform === "win32";

const idFile = join(here, "client-id.txt");
const clientId =
  (existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "") ||
  cfg.clientId ||
  "";

if (!clientId || clientId.startsWith("PASTE")) {
  console.error("No Discord Application ID set. Run: das setup");
  process.exit(1);
}

const client = new Client({ clientId });

function pretty(name) {
  if (!name) return null;
  if (cfg.nameMap[name]) return cfg.nameMap[name];
  const low = name.toLowerCase();
  for (const [k, v] of Object.entries(cfg.nameMap)) {
    if (k.length > 3 && low.includes(k.toLowerCase())) return v;
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function getFocusedLinux() {
  const { stdout } = await run("gdbus", [
    "call", "--session",
    "--dest", "org.gnome.Shell",
    "--object-path", "/org/gnome/shell/extensions/FocusedWindow",
    "--method", "org.gnome.shell.extensions.FocusedWindow.Get",
  ]);
  const m = stdout.match(/^\('(.*)',\)\s*$/s);
  if (!m) return null;
  const json = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const data = JSON.parse(json);
  if (!data || !data.wm_class) return null;
  return { app: pretty(data.wm_class), wm: data.wm_class, exe: "" };
}

async function getFocusedWindows() {
  const { stdout } = await run("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", join(here, "winfocus.ps1"),
  ], { timeout: 15000 });
  const data = JSON.parse(stdout.trim() || "{}");
  if (!data || !data.wm) return null;
  return { app: pretty(data.app || data.wm), wm: data.wm, exe: data.exe || "" };
}

async function getFocused() {
  try {
    return isWin ? await getFocusedWindows() : await getFocusedLinux();
  } catch {
    return null;
  }
}

let last = null;
const startedAt = Date.now();

async function tick() {
  const cur = await getFocused();
  const app = cur?.app ?? null;
  if (app === last) return;
  last = app;

  if (!app) {
    if (cfg.hideWhenIdle) await client.user?.clearActivity().catch(() => {});
    return;
  }

  const icon = await resolveIcon(cur.wm, cur.exe);

  await client.user?.setActivity({
    details: `In ${app}`,
    startTimestamp: startedAt,
    largeImageKey: icon,
    largeImageText: app,
    instance: false,
  }).catch((e) => console.error("setActivity:", e.message));

  console.log(new Date().toLocaleTimeString(), "->", app, icon);
}

client.on("ready", () => {
  console.log("Connected to Discord as", client.user?.username ?? "user");
  tick();
  setInterval(tick, (cfg.pollSeconds || 5) * 1000);
});

client.login().catch((e) => {
  console.error("Discord login failed:", e.message);
  console.error("Is Discord running?");
  process.exit(1);
});
