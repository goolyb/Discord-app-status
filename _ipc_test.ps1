param([switch]$SkipRun)
$ErrorActionPreference = "Stop"
$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DasDiscordIpc2 {
  [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int cls, IntPtr inf, int len, out int ret);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(int acc, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool DuplicateHandle(IntPtr srcProc, IntPtr srcH, IntPtr tgtProc, out IntPtr tgtH, uint acc, bool inherit, uint opts);
  [DllImport("kernel32.dll")] static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint pid);

  public static int[] ClientPids(int discordPid) {
    var clients = new HashSet<int>();
    int size = 2 * 1024 * 1024;
    IntPtr buf = IntPtr.Zero;
    IntPtr hp = OpenProcess(0x0040, false, discordPid);
    if (hp == IntPtr.Zero || hp == (IntPtr)(-1)) return new int[0];
    try {
      int ret, nt;
      while (true) {
        buf = Marshal.AllocHGlobal(size);
        nt = NtQuerySystemInformation(64, buf, size, out ret);
        if (nt == 0) break;
        Marshal.FreeHGlobal(buf);
        buf = IntPtr.Zero;
        if (nt == unchecked((int)0xC0000004)) { size = Math.Max(ret + 4096, size * 2); continue; }
        return new int[0];
      }
      long handleCount = Marshal.ReadIntPtr(buf).ToInt64();
      int header = IntPtr.Size * 2;
      int entrySize = IntPtr.Size * 3 + 16;
      for (long i = 0; i < handleCount; i++) {
        IntPtr e = IntPtr.Add(buf, header + (int)(i * entrySize));
        int pid = (int)Marshal.ReadIntPtr(e, IntPtr.Size).ToInt64();
        if (pid != discordPid) continue;
        IntPtr hv = Marshal.ReadIntPtr(e, IntPtr.Size * 2);
        IntPtr dup;
        if (!DuplicateHandle(hp, hv, GetCurrentProcess(), out dup, 0, false, 2)) continue;
        try {
          uint cpid;
          if (GetNamedPipeClientProcessId(dup, out cpid) && cpid != 0)
            clients.Add((int)cpid);
        } finally { CloseHandle(dup); }
      }
    } finally {
      if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
      CloseHandle(hp);
    }
    var arr = new int[clients.Count];
    clients.CopyTo(arr);
    return arr;
  }
}
"@
if (-not ("DasDiscordIpc2" -as [type])) { Add-Type -TypeDefinition $code }
if ($SkipRun) { return }
$main = Get-CimInstance Win32_Process -Filter "Name='Discord.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
if (-not $main) { Write-Host "no discord main"; exit 1 }
Write-Host "discord main $($main.ProcessId)"
$sw = [Diagnostics.Stopwatch]::StartNew()
$pids = [DasDiscordIpc2]::ClientPids([int]$main.ProcessId)
Write-Host "elapsed $($sw.ElapsedMilliseconds)ms count=$($pids.Length)"
foreach ($id in $pids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  Write-Host "$id $($p.ProcessName)"
}
