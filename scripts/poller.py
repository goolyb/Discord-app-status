import ctypes, json, time
from ctypes import wintypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

TH32CS_SNAPPROCESS = 0x2

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
                ("dwFlags", wintypes.DWORD), ("szExeFile", ctypes.c_char * 260)]

def list_processes():
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    entry = PROCESSENTRY32()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
    procs = {}
    if kernel32.Process32First(snap, ctypes.byref(entry)):
        while True:
            procs[entry.th32ProcessID] = entry.szExeFile.decode(errors="ignore").lower()
            if not kernel32.Process32Next(snap, ctypes.byref(entry)):
                break
    kernel32.CloseHandle(snap)
    return procs

def foreground_pid():
    hwnd = user32.GetForegroundWindow()
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value

IDE_NAMES = {"cursor.exe", "code.exe"}
GAME_NAMES = {"dota2.exe"}

if __name__ == "__main__":
    while True:
        procs = list_processes()
        pid = foreground_pid()
        exe = procs.get(pid, "")
        if exe in IDE_NAMES:
            state = "ide"
        elif exe in GAME_NAMES:
            state = "game"
        else:
            state = "other"
        print(json.dumps({"state": state, "exe": exe}), flush=True)
        time.sleep(0.5)

        