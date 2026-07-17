import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync, readFileSync as rf } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "icon-cache.json");
const CDN = (s) => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${s}.png`;
const REFRESH_AFTER = 40 * 3600 * 1000; // re-upload litterbox links before 72h expiry
const LITTERBOX = "https://litterbox.catbox.moe/resources/internals/api.php";

const CDN_MAP = {
  "google-chrome": "google-chrome", chromium: "chromium", firefox: "firefox",
  code: "visual-studio-code", spotify: "spotify", discord: "discord",
  steam: "steam", obsidian: "obsidian", "telegram-desktop": "telegram",
  "org.telegram.desktop": "telegram", "jetbrains-idea": "intellij",
};

function loadCache() {
  try { return JSON.parse(readFileSync(CACHE, "utf8")); } catch { return {}; }
}
function saveCache(c) {
  try { writeFileSync(CACHE, JSON.stringify(c, null, 2)); } catch {}
}
function loadOverrides() {
  try {
    const cfg = JSON.parse(readFileSync(join(HERE, "config.json"), "utf8"));
    return cfg.iconOverride || {};
  } catch { return {}; }
}

async function cdnOk(slug) {
  const url = CDN(slug);
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok ? url : null;
  } catch { return null; }
}

async function litterbox(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const buf = rf(path);
      const fd = new FormData();
      fd.append("reqtype", "fileupload");
      fd.append("time", "72h");
      fd.append("fileToUpload", new Blob([buf]), "icon.png");
      const r = await fetch(LITTERBOX, {
        method: "POST", body: fd, headers: { "User-Agent": "Mozilla/5.0" },
      });
      const t = (await r.text()).trim();
      if (t.startsWith("http")) return t;
    } catch {}
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

// Platform-specific: return absolute path to a local PNG icon, or "".
async function localIconPng(wm, exe) {
  try {
    if (process.platform === "win32") {
      if (!exe) return "";
      const out = join(tmpdir(), "das-icon-" + wm.replace(/[^a-z0-9]/gi, "_") + ".png");
      const { stdout } = await run("powershell", [
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", join(HERE, "winicon.ps1"), exe, out,
      ], { timeout: 20000 });
      const p = stdout.trim();
      return existsSync(p) ? p : "";
    }
    // linux/other: gtk icon theme via python helper
    const { stdout } = await run("python3", [join(HERE, "resolve_icon.py"), wm], {
      timeout: 20000,
    });
    const p = stdout.trim();
    return p && existsSync(p) ? p : "";
  } catch { return ""; }
}

export async function resolveIcon(wm, exe = "") {
  if (!wm) return "app";
  const cache = loadCache();
  const now = Date.now();
  const ent = cache[wm];
  if (ent) {
    if (ent.source === "cdn" || ent.source === "override") return ent.url;
    if (now - (ent.ts || 0) < REFRESH_AFTER) return ent.url;
  }

  // 0) manual override (substring match on window class)
  for (const [key, val] of Object.entries(loadOverrides())) {
    if (wm.toLowerCase().includes(key.toLowerCase())) {
      if (val.startsWith("http")) {
        cache[wm] = { url: val, source: "override", ts: now };
        saveCache(cache);
        return val;
      }
      const path = isAbsolute(val) ? val : join(HERE, val);
      const u = existsSync(path) ? await litterbox(path) : null;
      if (u) { cache[wm] = { url: u, source: "litterbox", ts: now }; saveCache(cache); return u; }
    }
  }

  // 1) real icon from THIS machine
  const png = await localIconPng(wm, exe);
  if (png) {
    const u = await litterbox(png);
    if (u) { cache[wm] = { url: u, source: "litterbox", ts: now }; saveCache(cache); return u; }
  }

  // 2) fallback: public icon CDN
  let slug = CDN_MAP[wm] || CDN_MAP[wm.toLowerCase()];
  if (!slug) {
    const guess = wm.toLowerCase().split(".").pop();
    if (await cdnOk(guess)) slug = guess;
  }
  if (slug) {
    const u = await cdnOk(slug);
    if (u) { cache[wm] = { url: u, source: "cdn", ts: now }; saveCache(cache); return u; }
  }

  return ent ? ent.url || "app" : "app";
}
