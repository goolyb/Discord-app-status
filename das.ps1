# discord-app-status control CLI (Windows)
param([string]$Command = "help", [string]$Arg = "")

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
$PidFile = Join-Path $Here ".das.pid"
$Log = Join-Path $Here "das.log"
$ErrLog = Join-Path $Here "das.log.err"
$IdFile = Join-Path $Here "client-id.txt"

function Show-DasLog {
  param([int]$Tail = 30, [switch]$Wait)
  $files = @()
  if ((Test-Path $ErrLog) -and (Get-Item $ErrLog).Length -gt 0) { $files += $ErrLog }
  if (Test-Path $Log) { $files += $Log }
  if (-not $files) { Write-Host "(no log output yet)"; return }
  if ($Wait) { Get-Content $files -Tail $Tail -Wait }
  else { Get-Content $files -Tail $Tail -ErrorAction SilentlyContinue }
}
$StartupLnk = Join-Path ([Environment]::GetFolderPath("Startup")) "DiscordAppStatus.lnk"

function Get-RunningPid {
  if (Test-Path $PidFile) {
    $procId = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { return [int]$procId }
  }
  return $null
}

function Stop-DasTree([int]$ProcId) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $ProcId } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
}

switch ($Command) {
  "setup" {
    $id = $Arg
    if (-not $id) { $id = Read-Host "Enter your Discord Application (client) ID" }
    $id = ($id -replace '[^0-9]', '')
    if (-not $id) { Write-Host "Invalid ID."; break }
    Set-Content -Path $IdFile -Value $id -NoNewline
    Write-Host "Saved. Client ID: $id"
    Write-Host "Now run: .\das.cmd start"
  }
  "start" {
    if (-not (Test-Path $IdFile)) { Write-Host "No client ID. Run: .\das.cmd setup"; break }
    if (Get-RunningPid) { Write-Host "Already running (pid $(Get-RunningPid))."; break }
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { Write-Host "node not found. Install Node.js."; break }
    $p = Start-Process -FilePath "node.exe" `
      -ArgumentList @("index.js") `
      -WorkingDirectory $Here -WindowStyle Hidden `
      -RedirectStandardOutput $Log -RedirectStandardError $ErrLog -PassThru
    Set-Content -Path $PidFile -Value $p.Id -NoNewline

    python "$Here\scripts\bar.py" start $p.Id $Log
    switch ($LASTEXITCODE) {
      0 { Write-Host "Started (pid $($p.Id)). Logs: .\das.cmd logs" }
      1 { Write-Host "Failed to start. Last log:"; Show-DasLog -Tail 40 }
      default { Write-Host "Running (pid $($p.Id)), but no ready message yet." }
    }
  }
  "stop" {
    $procId = Get-RunningPid
    if (-not $procId) { Write-Host "Not running." }
    else {
      Stop-DasTree $procId
      python "$Here\scripts\bar.py" stop $procId
      Remove-Item $PidFile -ErrorAction SilentlyContinue
      Write-Host "Stopped."
    }
  }
  "restart" { & $MyInvocation.MyCommand.Path stop; Start-Sleep 1; & $MyInvocation.MyCommand.Path start }
  "status" {
    $procId = Get-RunningPid
    if ($procId) { Write-Host "* running (pid $procId)"; Show-DasLog -Tail 3 }
    else { Write-Host "o stopped" }
  }
  "logs" { Show-DasLog -Tail 50 -Wait }
  "enable-autostart" {
    $success = $false
    try {
      $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Here\das.ps1`" start" -WorkingDirectory $Here
      $trigger = New-ScheduledTaskTrigger -AtLogOn
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Priority 1
      $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

      Register-ScheduledTask -TaskName "DiscordAppStatus" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
      $success = $true
      Write-Host "Autostart enabled via Scheduled Task (highest admin privileges)."
    } catch {}

    if (-not $success) {
      $ws = New-Object -ComObject WScript.Shell
      $lnk = $ws.CreateShortcut($StartupLnk)
      $lnk.TargetPath = "powershell.exe"
      $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Here\das.ps1`" start"
      $lnk.WorkingDirectory = $Here
      $lnk.Save()
      Write-Host "Autostart enabled via Startup folder shortcut."
    }
  }
  "disable-autostart" {
    Unregister-ScheduledTask -TaskName "DiscordAppStatus" -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $StartupLnk -ErrorAction SilentlyContinue
    Write-Host "Autostart disabled."
  }
  default {
    @"
discord-app-status - show your focused app in Discord

Usage: .\das.cmd <command>
   (or double-click start.cmd)

  setup [ID]          set your Discord Application ID (asks if omitted)
  start               start the integration
  stop                stop the integration
  restart             restart it
  status              is it running?
  logs                follow the log
  enable-autostart    run automatically on login
  disable-autostart   don't run on login

First time:  .\das.cmd setup   then   .\das.cmd start
  Daily:       start.cmd   or   .\das.cmd start
"@ | Write-Host
  }
}
