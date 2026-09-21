# Extracts / pads an icon to a square PNG. Args: <srcExeOrPng> <outPng> [size] [content]
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Size = 256,
  [int]$Content = 224
)
if (-not (Test-Path $Src)) { exit 1 }
if ($Content -gt $Size) { $Content = $Size }
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class ShellIconExtractor {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int PrivateExtractIcons(
        string lpszFile, int nIconIndex, int cxIcon, int cyIcon,
        IntPtr[] phicon, int[] piconid, int nIcons, int flags);

    public static Icon ExtractHighRes(string path, int targetSize) {
        try {
            IntPtr[] phicon = new IntPtr[1];
            int[] piconid = new int[1];
            int res = PrivateExtractIcons(path, 0, targetSize, targetSize, phicon, piconid, 1, 0);
            if (res > 0 && phicon[0] != IntPtr.Zero) {
                Icon ico = (Icon)Icon.FromHandle(phicon[0]).Clone();
                DestroyIcon(phicon[0]);
                return ico;
            }
        } catch {}
        return null;
    }
}
"@

try {
  Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing -ErrorAction SilentlyContinue
} catch {}

try {
  $srcImg = $null
  $bmp = $null
  if ($Src -match '\.png$') {
    $srcImg = [System.Drawing.Image]::FromFile($Src)
    $bmp = New-Object System.Drawing.Bitmap $srcImg
    $srcImg.Dispose(); $srcImg = $null
  } else {
    $ico = [ShellIconExtractor]::ExtractHighRes($Src, $Content)
    if (-not $ico) {
      $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($Src)
    }
    $bmp = $ico.ToBitmap()
    $ico.Dispose()
  }

  $canvas = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $scale = [Math]::Min($Content / [double]$bmp.Width, $Content / [double]$bmp.Height)
  $nw = [Math]::Max(1, [int]($bmp.Width * $scale))
  $nh = [Math]::Max(1, [int]($bmp.Height * $scale))
  $x = [int](($Size - $nw) / 2)
  $y = [int](($Size - $nh) / 2)
  $g.DrawImage($bmp, $x, $y, $nw, $nh)
  $g.Dispose()
  $bmp.Dispose()

  $dir = Split-Path $Out -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $canvas.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  Write-Output $Out
} catch {
  if ($srcImg) { $srcImg.Dispose() }
  exit 1
}

