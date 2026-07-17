# Extracts the icon of an .exe to a PNG. Args: <exePath> <outPng>
param([string]$Exe, [string]$Out)
if (-not (Test-Path $Exe)) { exit 1 }
Add-Type -AssemblyName System.Drawing
try {
  $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($Exe)
  $bmp = $ico.ToBitmap()
  $dir = Split-Path $Out -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $ico.Dispose()
  Write-Output $Out
} catch { exit 1 }
