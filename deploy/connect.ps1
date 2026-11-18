param([int]$Port=8080)
$ErrorActionPreference='Stop'
$cloudCli=(Get-Command gcloud.cmd -ErrorAction SilentlyContinue).Source
if(-not $cloudCli){$cloudCli=Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'}
Write-Host "Biarkan terminal ini terbuka. Akses aplikasi: http://localhost:$Port"
& $cloudCli compute ssh kunci-erp-pilot --project=kunci-group-erp-20261116 --zone=us-central1-a --tunnel-through-iap --quiet -- -N -L "${Port}:127.0.0.1:8080"
