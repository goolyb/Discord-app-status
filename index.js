import { Client } from "@xhayper/discord-rpc";
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
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

const urlPort = cfg.urlPort || 6060;
const urlMaxAgeMs = (cfg.urlMaxAgeSeconds || 30) * 1000;
let latestUrl = { url: "", at: 0 };

createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      latestUrl = { url: body.trim(), at: Date.now() };
      res.end("ok");
    });
  } else {
    res.end("das");
  }
}).listen(urlPort, "127.0.0.1", () => {
  console.log("URL receiver on 127.0.0.1:" + urlPort);
});

function domainOf(u) {
  try {
    const proto = new URL(u).protocol;
    if (proto !== "http:" && proto !== "https:") return null;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function browserDomain(wm) {
  const w = (wm || "").toLowerCase();
  if (!/firefox|chrome|chromium|brave|zen|msedge/.test(w)) return null;
  if (Date.now() - latestUrl.at > urlMaxAgeMs) return null;
  return domainOf(latestUrl.url);
}

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

let lastSentAt = 0;
let pending = null;
let flushTimer = null;

function flush() {
  flushTimer = null;
  if (!pending) return;
  const job = pending;
  pending = null;
  lastSentAt = Date.now();
  if (job.clear) {
    client.user?.clearActivity().catch(() => {});
  } else {
    client.user
      ?.setActivity(job.activity)
      .catch((e) => console.error("setActivity:", e.message));
  }
}

function push(job) {
  pending = job;
  if (flushTimer) return;
  const wait = Math.max(0, 15000 - (Date.now() - lastSentAt));
  flushTimer = setTimeout(flush, wait);
}

async function tick() {
  const cur = await getFocused();
  const app = cur?.app ?? null;
  const domain = app ? browserDomain(cur.wm) : null;
  const key = app ? app + "|" + (domain || "") : null;
  if (key === last) return;
  last = key;

  if (!app) {
    if (cfg.hideWhenIdle) push({ clear: true });
    return;
  }

  const icon = await resolveIcon(cur.wm, cur.exe);

  const activity = {
    name: app.toUpperCase(),
    type: 0,
    statusDisplayType: 0,
    startTimestamp: startedAt,
    largeImageKey: icon,
    largeImageText: app,
    instance: false,
  };
  if (domain) activity.details = domain;

  push({ activity });

  console.log(new Date().toLocaleTimeString(), "->", app, domain || "", icon);
}

client.on("ready", () => {
  console.log("Connected to Discord as", client.user?.username ?? "user");
  tick();
  setInterval(tick, (cfg.pollSeconds || 5) * 1000);
});

async function connect() {
  const delay = (cfg.retrySeconds || 15) * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      await client.login();
      return;
    } catch (e) {
      console.error(`Discord login failed (attempt ${attempt}):`, e.message);
      console.error(`Discord not reachable yet — retrying in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

connect();
