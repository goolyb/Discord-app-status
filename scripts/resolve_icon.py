#!/usr/bin/env python3
# Linux helper: given a window class, print the absolute path to a PNG icon
# pulled from the system icon theme / .desktop files. Prints nothing if none.
import sys, os, glob, configparser, json

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = "/tmp/discord-app-status-icons"

ICON_SIZE = 1024
ICON_CONTENT = 1024

_cfg_mtime = 0

def reload_config_if_changed():
    global _cfg_mtime, ICON_SIZE, ICON_CONTENT
    path = os.path.join(HERE, "..", "config.json")
    try:
        mtime = os.path.getmtime(path)
        if mtime == _cfg_mtime:
            return False
        _cfg_mtime = mtime
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
        ICON_SIZE = int(cfg.get("iconSize") or ICON_SIZE)
        ICON_CONTENT = int(cfg.get("iconContent") or ICON_CONTENT)
        if ICON_CONTENT > ICON_SIZE:
            ICON_CONTENT = ICON_SIZE
        return True  
    except Exception as e:
        print("resolve_icon.py: config error:", e)
        return False

def _pad_square(pb):
    from gi.repository import GdkPixbuf
    w, h = pb.get_width(), pb.get_height()
    canvas = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, True, 8, ICON_SIZE, ICON_SIZE)
    canvas.fill(0x00000000)
    ox = (ICON_SIZE - w) // 2
    oy = (ICON_SIZE - h) // 2
    pb.composite(canvas, ox, oy, w, h, ox, oy, 1, 1,
                 GdkPixbuf.InterpType.BILINEAR, 255)
    return canvas


def rasterize(icon_name):
    os.makedirs(TMP, exist_ok=True)
    out = os.path.join(TMP, icon_name.replace("/", "_") + ".png")
    if os.path.isfile(icon_name):  # absolute path icon
        src = icon_name
    else:
        try:
            import gi
            gi.require_version("Gtk", "3.0")
            gi.require_version("GdkPixbuf", "2.0")
            from gi.repository import Gtk
            theme = Gtk.IconTheme.get_default()
            pb = theme.load_icon(icon_name, ICON_CONTENT, 0)
            _pad_square(pb).savev(out, "png", [], [])
            return out
        except Exception:
            return None
    try:
        import gi
        gi.require_version("GdkPixbuf", "2.0")
        from gi.repository import GdkPixbuf
        pb = GdkPixbuf.Pixbuf.new_from_file_at_size(src, ICON_CONTENT, ICON_CONTENT)
        _pad_square(pb).savev(out, "png", [], [])
        return out
    except Exception:
        return src if src.lower().endswith(".png") else None


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


def resolve_local(wm):
    png = rasterize(wm)
    if not png:
        dn = desktop_icon_name(wm)
        if dn:
            png = rasterize(dn)
    return png or ""


if __name__ == "__main__":
    wm = sys.argv[1] if len(sys.argv) > 1 else ""
    print(resolve_local(wm) if wm else "")

if reload_config_if_changed():
    cache = {"_meta": {"size": ICON_SIZE, "content": ICON_CONTENT}}
    save_cache(cache)
