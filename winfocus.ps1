# Prints JSON {app, wm, exe} for the current foreground window.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DasWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$h = [DasWin]::GetForegroundWindow()
$procId = 0
[void][DasWin]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
if (-not $p) { '{}'; exit }
$exe = ""
$desc = ""
try { $exe = $p.Path } catch {}
try { $desc = $p.MainModule.FileVersionInfo.FileDescription } catch {}
$name = if ($desc) { $desc } else { $p.ProcessName }
$obj = @{ app = $name; wm = $p.ProcessName; exe = $exe }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$obj | ConvertTo-Json -Compress
