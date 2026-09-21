& "$PSScriptRoot\_ipc_test.ps1" -SkipRun
Get-CimInstance Win32_Process -Filter "Name='Discord.exe'" | ForEach-Object {
  $kind = "main"
  if ($_.CommandLine -match '--type=(\S+)') { $kind = $Matches[1] }
  Write-Host "==== $($_.ProcessId) $kind"
  $pids = [DasDiscordIpc2]::ClientPids([int]$_.ProcessId)
  Write-Host "count $($pids.Length)"
  foreach ($id in $pids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    Write-Host "  $id $($p.ProcessName)"
  }
}
Write-Host "==== node"
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_.Id }
