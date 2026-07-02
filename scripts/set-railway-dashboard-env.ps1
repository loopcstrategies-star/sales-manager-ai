# Set Railway dashboard env vars (GoldAPI + NewsAPI) without extra Tavily usage.
# Prereq: railway login  (https://docs.railway.com/develop/cli)
#
# Usage:
#   .\scripts\set-railway-dashboard-env.ps1
#   .\scripts\set-railway-dashboard-env.ps1 -GoldApiKey "..." -NewsApiKey "..."
#   # Or put keys in backend/.env.dashboard (gitignored) and run without args

param(
  [string]$GoldApiKey = "",
  [string]$NewsApiKey = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$localFile = Join-Path $root "backend\.env.dashboard"

function Read-DotEnvFile([string]$path) {
  if (-not (Test-Path $path)) { return @{} }
  $map = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $map[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $map
}

if (-not $GoldApiKey -or -not $NewsApiKey) {
  $local = Read-DotEnvFile $localFile
  if (-not $GoldApiKey) { $GoldApiKey = $local.GOLDAPI_KEY }
  if (-not $NewsApiKey) { $NewsApiKey = $local.NEWSAPI_KEY }
}

if (-not $GoldApiKey) {
  Write-Host ""
  Write-Host "GoldAPI (free): https://www.goldapi.io"
  $GoldApiKey = Read-Host "Paste GOLDAPI_KEY (or press Enter to skip)"
}

if (-not $NewsApiKey) {
  Write-Host ""
  Write-Host "NewsAPI (free dev): https://newsapi.org/register"
  $NewsApiKey = Read-Host "Paste NEWSAPI_KEY (or press Enter to skip)"
}

Push-Location $root
try {
  railway whoami 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: railway login"
    Write-Host "Then re-run this script."
    exit 1
  }

  Write-Host "Setting Railway variables on api service..."
  railway variables --set "DASHBOARD_REFRESH_HOURS=4" --service api

  if ($GoldApiKey) {
    railway variables --set "GOLDAPI_KEY=$GoldApiKey" --service api
    Write-Host "GOLDAPI_KEY set."
  } else {
    Write-Host "Skipped GOLDAPI_KEY (no price tiles until set)."
  }

  if ($NewsApiKey) {
    railway variables --set "NEWSAPI_KEY=$NewsApiKey" --service api
    Write-Host "NEWSAPI_KEY set."
  } else {
    Write-Host "Skipped NEWSAPI_KEY (RSS still works without it)."
  }

  Write-Host ""
  Write-Host "Done. Railway will redeploy in ~1-2 min."
  Write-Host "Verify: https://sales.loopcstrategies.com/dashboard -> Refresh now"
} finally {
  Pop-Location
}
