import sys, time, re, subprocess
from alive_progress import alive_bar

mode, pid = sys.argv[1], int(sys.argv[2])
log = sys.argv[3] if len(sys.argv) > 3 else None
TIMEOUT = 20

def alive(p):
    out = subprocess.run(["tasklist", "/FI", f"PID eq {p}", "/NH"],
                         capture_output=True, text=True).stdout
    return str(p) in out

def ready():
    try:
        with open(log, encoding="utf-8", errors="ignore") as f:
            return re.search(r"ready|logged in", f.read(), re.I) is not None
    except FileNotFoundError:
        return False

code = 2
t0 = time.time()
with alive_bar(manual=True, title="Starting" if mode == "start" else "Stopping") as bar:
    while time.time() - t0 < TIMEOUT:
        if mode == "start":
            if not alive(pid): code = 1; break
            if ready(): code = 0; break
        elif not alive(pid):
            code = 0; break
        bar((time.time() - t0) / TIMEOUT)
        time.sleep(0.2)
    if code == 0:
        bar(1.0)
sys.exit(code)