# discord-app-status control CLI (Windows)
param([string]$Command = "help", [string]$Arg = "")

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
$PidFile = Join-Path $Here ".das.pid"
$Log = Join-Path $Here "das.log"
$IdFile = Join-Path $Here "client-id.txt"
$StartupLnk = Join-Path ([Environment]::GetFolderPath("Startup")) "DiscordAppStatus.lnk"

function Get-RunningPid {
  if (Test-Path $PidFile) {
    $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { return [int]$procId }
  }
  return $null
}

switch ($Command) {
  "setup" {
    $id = $Arg
    if (-not $id) { $id = Read-Host "Enter your Discord Application (client) ID" }
    $id = ($id -replace '[^0-9]', '')
    if (-not $id) { Write-Host "Invalid ID."; break }
    Set-Content -Path $IdFile -Value $id -NoNewline
    Write-Host "Saved. Client ID: $id"
    Write-Host "Now run: .\das.ps1 start"
  }
  "start" {
    if (-not (Test-Path $IdFile)) { Write-Host "No client ID. Run: .\das.ps1 setup"; break }
    if (Get-RunningPid) { Write-Host "Already running (pid $(Get-RunningPid))."; break }
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { Write-Host "node not found. Install Node.js."; break }
    $p = Start-Process -FilePath $node -ArgumentList (Join-Path $Here "index.js") `
      -WindowStyle Hidden -RedirectStandardOutput $Log -RedirectStandardError "$Log.err" -PassThru
    Set-Content -Path $PidFile -Value $p.Id -NoNewline
    Start-Sleep -Seconds 3
    if (Get-RunningPid) { Write-Host "Started (pid $($p.Id)). Logs: .\das.ps1 logs" }
    else { Write-Host "Failed to start. Check das.log" }
  }
  "stop" {
    $procId = Get-RunningPid
    if (-not $procId) { Write-Host "Not running." }
    else { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; Remove-Item $PidFile -ErrorAction SilentlyContinue; Write-Host "Stopped." }
  }
  "restart" { & $MyInvocation.MyCommand.Path stop; Start-Sleep 1; & $MyInvocation.MyCommand.Path start }
  "status" {
    $procId = Get-RunningPid
    if ($procId) { Write-Host "* running (pid $procId)"; Get-Content $Log -Tail 1 -ErrorAction SilentlyContinue }
    else { Write-Host "o stopped" }
  }
  "logs" { Get-Content $Log -Tail 30 -Wait }
  "enable-autostart" {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($StartupLnk)
    $lnk.TargetPath = "powershell.exe"
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $Here 'das.ps1')`" start"
    $lnk.WorkingDirectory = $Here
    $lnk.Save()
    Write-Host "Autostart enabled (runs on login)."
  }
  "disable-autostart" { Remove-Item $StartupLnk -ErrorAction SilentlyContinue; Write-Host "Autostart disabled." }
  default {
    @"
discord-app-status - show your focused app in Discord

Usage: .\das.ps1 <command>

  setup [ID]          set your Discord Application ID (asks if omitted)
  start               start the integration
  stop                stop the integration
  restart             restart it
  status              is it running?
  logs                follow the log
  enable-autostart    run automatically on login
  disable-autostart   don't run on login

First time:  .\das.ps1 setup   then   .\das.ps1 start
"@ | Write-Host
  }
}
