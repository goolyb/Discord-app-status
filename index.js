import { Client } from "@xhayper/discord-rpc";
import { execFile } from "node:child_process";
import { readFileSync, existsSync, readdirSync, readlinkSync } from "node:fs";
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

function getHighResUrl(url) {
  if (!url) return url;
  
  let cleanUrl = url.replace(/([?&])(w|width|h|height|size)=\d+/g, '');
  
  cleanUrl = cleanUrl.replace('hqdefault.jpg', 'maxresdefault.jpg');
  
  return cleanUrl;
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

function loadBlacklist() {
  try {
    const c = JSON.parse(readFileSync(join(here, "config.json"), "utf8"));
    return (c.blacklist || []).map((s) =>
      String(s).toLowerCase().replace(/^www\./, "")
    );
  } catch {
    return [];
  }
}

function isBlocked(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return loadBlacklist().some((b) => b && (d === b || d.endsWith("." + b)));
}

function browserDomain(wm) {
  const w = (wm || "").toLowerCase();
  if (!/firefox|chrome|chromium|brave|zen|msedge/.test(w)) return null;
  if (Date.now() - latestUrl.at > urlMaxAgeMs) return null;
  const d = domainOf(latestUrl.url);
  return isBlocked(d) ? null : d;
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
    "-File", join(here, "scripts", "winfocus.ps1"),
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

const YIELD_KEY = "__yield__";
const YIELD_TTL_MS = 2000;
const DISCORD_HOST = /^(discord|vesktop|webcord|electron)$/i;
let yieldCache = { at: 0, others: [], pending: null };

function asList(v) {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
}

function yieldEnabled() {
  try {
    const c = JSON.parse(readFileSync(join(here, "config.json"), "utf8"));
    return c.yieldToOtherRpc !== false;
  } catch {
    return cfg.yieldToOtherRpc !== false;
  }
}

async function winOtherRpc() {
  const { stdout } = await run(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(here, "scripts", "winrpc.ps1"),
      String(process.pid),
    ],
    { timeout: 20000, windowsHide: true }
  );
  const raw = stdout.trim();
  const m = raw.match(/\{[\s\S]*\}\s*$/);
  const data = JSON.parse(m ? m[0] : "{}");
  return asList(data.others);
}

function linuxOtherRpc() {
  const others = [];
  let pids;
  try {
    pids = readdirSync("/proc");
  } catch {
    return others;
  }
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    if (Number(pid) === process.pid) continue;
    let comm = "";
    try {
      comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    } catch {
      continue;
    }
    if (DISCORD_HOST.test(comm)) continue;
    try {
      for (const fd of readdirSync(`/proc/${pid}/fd`)) {
        const t = readlinkSync(`/proc/${pid}/fd/${fd}`);
        if (t.includes("discord-ipc")) {
          others.push(comm);
          break;
        }
      }
    } catch {}
  }
  return [...new Set(others)];
}

async function otherRpcClients() {
  if (!yieldEnabled()) return [];
  if (yieldCache.pending) return yieldCache.pending;
  if (Date.now() - yieldCache.at < YIELD_TTL_MS) return yieldCache.others;

  yieldCache.pending = (isWin ? winOtherRpc() : Promise.resolve(linuxOtherRpc()))
    .then((others) => {
      yieldCache = { at: Date.now(), others, pending: null };
      return others;
    })
    .catch((e) => {
      console.error("yield scan failed:", e.message);
      yieldCache.pending = null;
      yieldCache.at = Date.now();
      return yieldCache.others;
    });

  return yieldCache.pending;
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
  const minGap = (cfg.minUpdateSeconds || 5) * 1000;
  const wait = Math.max(0, minGap - (Date.now() - lastSentAt));
  flushTimer = setTimeout(flush, wait);
}

function isFocusedAppInOthers(cur, others) {
  if (!cur || !others || !others.length) return false;
  const wm = (cur.wm || "").toLowerCase();
  const app = (cur.app || "").toLowerCase();
  const exe = (cur.exe || "").toLowerCase();

  return others.some((o) => {
    const low = o.toLowerCase();
    if (!low) return false;
    return (
      wm === low ||
      app === low ||
      (wm && low.includes(wm)) ||
      (wm && wm.includes(low)) ||
      (exe && exe.includes(low))
    );
  });
}

async function tick() {
  const cur = await getFocused();
  const others = await otherRpcClients();

  if (isFocusedAppInOthers(cur, others)) {
    if (last !== YIELD_KEY) {
      last = YIELD_KEY;
      push({ clear: true });
      console.log("Yielding Discord status to focused app:", cur?.app || cur?.wm, "(others:", others.join(", ") + ")");
    }
    return;
  }

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
    name: app,
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
