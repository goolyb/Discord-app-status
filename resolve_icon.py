#!/usr/bin/env python3
import sys, os, json, time, subprocess, glob, configparser

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "icon-cache.json")
TMP = "/tmp/discord-app-status-icons"
CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/{}.png"
REFRESH_AFTER = 40 * 3600  # re-upload litterbox links before 72h expiry

CDN_MAP = {
    "google-chrome": "google-chrome", "chromium": "chromium", "firefox": "firefox",
    "code": "visual-studio-code", "spotify": "spotify", "discord": "discord",
    "steam": "steam", "obsidian": "obsidian", "telegram-desktop": "telegram",
    "org.telegram.desktop": "telegram", "jetbrains-idea": "intellij",
}


def load_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(c):
    try:
        with open(CACHE, "w") as f:
            json.dump(c, f, indent=2)
    except Exception:
        pass


def cdn_ok(slug):
    url = CDN.format(slug)
    try:
        r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                            "-I", url], capture_output=True, text=True, timeout=8)
        return url if r.stdout.strip() == "200" else None
    except Exception:
        return None


def _norm(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())


def desktop_icon_name(wm):
    dirs = ["/usr/share/applications", "/var/lib/snapd/desktop/applications",
            os.path.expanduser("~/.local/share/applications")]
    nwm = _norm(wm)
    if len(nwm) < 3:
        return None
    best = None  # (score, icon)
    for d in dirs:
        for f in glob.glob(os.path.join(d, "*.desktop")):
            try:
                cp = configparser.ConfigParser(interpolation=None, strict=False)
                cp.read(f, encoding="utf-8")
                if not cp.has_section("Desktop Entry"):
                    continue
                de = cp["Desktop Entry"]
                ic = de.get("Icon", "")
                if not ic:
                    continue
                swc = de.get("StartupWMClass", "")
                base = os.path.splitext(os.path.basename(f))[0]
                execbn = os.path.basename(de.get("Exec", "").split()[0]) if de.get("Exec") else ""
                name = de.get("Name", "")
                # score candidates: exact StartupWMClass > exact others > substring
                score = 0
                if swc and _norm(swc) == nwm:
                    score = 100
                elif nwm in (_norm(x) for x in (base, execbn, name) if x):
                    score = 80
                elif any(nwm and (nwm in _norm(x) or _norm(x) in nwm and len(_norm(x)) >= 3)
                         for x in (swc, base, execbn, name) if x):
                    score = 40
                if score and (best is None or score > best[0]):
                    best = (score, ic)
            except Exception:
                continue
    return best[1] if best else None


def rasterize(icon_name):
    os.makedirs(TMP, exist_ok=True)
    out = os.path.join(TMP, icon_name.replace("/", "_") + ".png")
    if os.path.isfile(icon_name):  # absolute path icon
        src = icon_name
    else:
        try:
            import gi
            gi.require_version("Gtk", "3.0")
            from gi.repository import Gtk
            theme = Gtk.IconTheme.get_default()
            pb = theme.load_icon(icon_name, 256, 0)
            pb.savev(out, "png", [], [])
            return out
        except Exception:
            return None
    try:
        import gi
        gi.require_version("GdkPixbuf", "2.0")
        from gi.repository import GdkPixbuf
        pb = GdkPixbuf.Pixbuf.new_from_file_at_size(src, 256, 256)
        pb.savev(out, "png", [], [])
        return out
    except Exception:
        return src if src.lower().endswith(".png") else None


def litterbox(path):
    for attempt in range(3):
        try:
            r = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0",
                                "-F", "reqtype=fileupload", "-F", "time=72h",
                                "-F", "fileToUpload=@" + path,
                                "https://litterbox.catbox.moe/resources/internals/api.php"],
                               capture_output=True, text=True, timeout=30)
            u = r.stdout.strip()
            if u.startswith("http"):
                return u
        except Exception:
            pass
        time.sleep(2)
    return None


def load_overrides():
    try:
        cfg = json.load(open(os.path.join(HERE, "config.json")))
        return cfg.get("iconOverride", {}) or {}
    except Exception:
        return {}


def resolve(wm):
    cache = load_cache()
    now = time.time()
    ent = cache.get(wm)
    if ent:
        if ent.get("source") in ("cdn", "override"):
            return ent["url"]
        if now - ent.get("ts", 0) < REFRESH_AFTER:
            return ent["url"]

    # 0) manual override (substring match on wm_class)
    for key, val in load_overrides().items():
        if key.lower() in wm.lower():
            url = val
            if not val.startswith("http"):  # local path -> host it
                path = val if os.path.isabs(val) else os.path.join(HERE, val)
                png = rasterize(path)
                url = litterbox(png) if png else None
            if url:
                src = "override" if val.startswith("http") else "litterbox"
                cache[wm] = {"url": url, "source": src, "ts": now}
                save_cache(cache)
                return url

    # 1) real system-theme icon from THIS PC -> litterbox (preferred)
    png = rasterize(wm)
    if not png:
        dn = desktop_icon_name(wm)
        if dn:
            png = rasterize(dn)
    if png:
        u = litterbox(png)
        if u:
            cache[wm] = {"url": u, "source": "litterbox", "ts": now}
            save_cache(cache)
            return u

    # 2) fallback: CDN logo only if PC has no icon for this app
    slug = CDN_MAP.get(wm) or CDN_MAP.get(wm.lower())
    if not slug:
        guess = wm.lower().split(".")[-1]
        if cdn_ok(guess):
            slug = guess
    if slug:
        u = cdn_ok(slug)
        if u:
            cache[wm] = {"url": u, "source": "cdn", "ts": now}
            save_cache(cache)
            return u

    if ent:  # expired but nothing better — keep old
        return ent.get("url", "")
    return ""


if __name__ == "__main__":
    wm = sys.argv[1] if len(sys.argv) > 1 else ""
    print(resolve(wm) if wm else "")
