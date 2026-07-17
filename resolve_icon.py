#!/usr/bin/env python3
# Linux helper: given a window class, print the absolute path to a PNG icon
# pulled from the system icon theme / .desktop files. Prints nothing if none.
import sys, os, glob, configparser

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = "/tmp/discord-app-status-icons"


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
