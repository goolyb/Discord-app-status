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
const REFRESH_AFTER = 2 * 3600 * 1000; // re-upload before short-lived host links expire
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

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

async function download(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const p = join(tmpdir(), "das-dl-" + url.replace(/[^a-z0-9]/gi, "_").slice(-48) + ".png");
    writeFileSync(p, buf);
    return p;
  } catch { return null; }
}

// pad any icon file into a fixed square with margin (reuses resolve_icon.py)
async function normalize(path) {
  try {
    if (process.platform === "win32") return path;
    const { stdout } = await run("python3", [join(HERE, "resolve_icon.py"), path], {
      timeout: 20000,
    });
    const p = stdout.trim();
    return p && existsSync(p) ? p : path;
  } catch { return path; }
}

// upload a local png, return a public direct-image URL (or null).
// litterbox/catbox died (403); use uguu.se, fall back to tmpfiles.org.
async function litterbox(path) {
  const buf = rf(path);
  for (let i = 0; i < 3; i++) {
    try {
      const fd = new FormData();
      fd.append("files[]", new Blob([buf]), "icon.png");
      const r = await fetch("https://uguu.se/upload.php", {
        method: "POST", body: fd, headers: { "User-Agent": UA },
      });
      if (r.ok) {
        const j = await r.json();
        const u = j?.files?.[0]?.url;
        if (u && u.startsWith("http")) return u;
      }
    } catch {}
    try {
      const fd = new FormData();
      fd.append("file", new Blob([buf]), "icon.png");
      const r = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST", body: fd, headers: { "User-Agent": UA },
      });
      if (r.ok) {
        const j = await r.json();
        const u = j?.data?.url;
        if (u) return u.replace("tmpfiles.org/", "tmpfiles.org/dl/");
      }
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
      let src = null;
      if (val.startsWith("http")) src = await download(val);
      else { const path = isAbsolute(val) ? val : join(HERE, val); src = existsSync(path) ? path : null; }
      if (src) {
        const u = await litterbox(await normalize(src));
        if (u) { cache[wm] = { url: u, source: "litterbox", ts: now }; saveCache(cache); return u; }
      }
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
    const cdnUrl = await cdnOk(slug);
    if (cdnUrl) {
      const dl = await download(cdnUrl);
      const u = dl ? await litterbox(await normalize(dl)) : null;
      if (u) { cache[wm] = { url: u, source: "litterbox", ts: now }; saveCache(cache); return u; }
      cache[wm] = { url: cdnUrl, source: "cdn", ts: now }; saveCache(cache); return cdnUrl;
    }
  }

  return ent ? ent.url || "app" : "app";
}
