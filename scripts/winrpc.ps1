# Prints JSON {others:["Game",...]} — other apps that should own Discord status.
param([int]$SelfPid)

$ErrorActionPreference = "SilentlyContinue"
$skip = [regex]'^(Discord|DiscordCanary|DiscordPTB|DiscordDevelopment|vesktop|WebCord|steamwebhelper|GameOverlayUI|EpicWebHelper|EasyAntiCheat|EasyAntiCheat_EOS)$'
$rpcCmd = [regex]'discord[-_]?rpc|discord_game_sdk|pypresence|@xhayper/discord-rpc|discordrpc'
$dllNames = @(
  "discord-rpc.dll",
  "discord_rpc.dll",
  "discord_game_sdk.dll",
  "discord_partner_sdk.dll",
  "DiscordRPC.dll"
)

$found = New-Object System.Collections.Generic.List[string]
function Add-Found([string]$name) {
  if ($name -and -not $found.Contains($name)) { [void]$found.Add($name) }
}

if (Get-Process Cursor -ErrorAction SilentlyContinue) {
  if (Test-Path "$env:USERPROFILE\.cursor\extensions\*discord*" -ErrorAction SilentlyContinue) {
    Add-Found "Cursor"
  }
}
if (Get-Process Code -ErrorAction SilentlyContinue) {
  if (Test-Path "$env:USERPROFILE\.vscode\extensions\*discord*" -ErrorAction SilentlyContinue) {
    Add-Found "Code"
  }
}

foreach ($p in Get-CimInstance Win32_Process) {
  if ([int]$p.ProcessId -eq $SelfPid) { continue }
  $base = [IO.Path]::GetFileNameWithoutExtension($p.Name)
  if (-not $base -or $skip.IsMatch($base)) { continue }

  if ($p.CommandLine -and $rpcCmd.IsMatch($p.CommandLine)) {
    Add-Found $base
    try {
      $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.ParentProcessId)" -ErrorAction SilentlyContinue
      if ($parent) {
        $pbase = [IO.Path]::GetFileNameWithoutExtension($parent.Name)
        if ($pbase -and -not $skip.IsMatch($pbase)) { Add-Found $pbase }
      }
    } catch {}
    continue
  }

  if ($exe) {
    $dir = [IO.Path]::GetDirectoryName($exe)
    if ($dir) {
      foreach ($dll in $dllNames) {
        if (Test-Path -LiteralPath ([IO.Path]::Combine($dir, $dll))) {
          Add-Found $base
          break
        }
      }
    }
  }
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$payload = @{ others = @($found.ToArray()) }
Write-Output ($payload | ConvertTo-Json -Compress)
