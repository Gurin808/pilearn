# One-line install and update for Windows (PowerShell):
#   irm https://raw.githubusercontent.com/Gurin808/pilearn/main/install-remote.ps1 | iex
# Clones PILearn to ~\pilearn (or $env:PILEARN_SRC), or updates it if it's
# already there, runs the normal installer, and puts the launcher on your PATH.
$ErrorActionPreference = "Stop"
$repo = if ($env:PILEARN_REPO) { $env:PILEARN_REPO } else { "https://github.com/Gurin808/pilearn" }
$dir = if ($env:PILEARN_SRC) { $env:PILEARN_SRC } else { Join-Path $HOME "pilearn" }

foreach ($cmd in "git", "node") {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "pilearn: $cmd is required. Install both with: winget install OpenJS.NodeJS.LTS Git.Git" -ForegroundColor Red
    return
  }
}

if (Test-Path (Join-Path $dir ".git")) {
  Write-Host "pilearn: updating $dir"
  git -C $dir pull --ff-only --quiet
} elseif (Test-Path $dir) {
  Write-Host "pilearn: $dir exists but isn't a PILearn checkout. Move it away or set PILEARN_SRC." -ForegroundColor Red
  return
} else {
  Write-Host "pilearn: downloading to $dir"
  git clone --quiet $repo $dir
}
if ($LASTEXITCODE) { Write-Host "pilearn: git failed." -ForegroundColor Red; return }

node (Join-Path $dir "install.mjs")
if ($LASTEXITCODE) { Write-Host "pilearn: the installer failed." -ForegroundColor Red; return }

$bin = if ($env:PILEARN_BIN) { $env:PILEARN_BIN } else { Join-Path $HOME ".pilearn\bin" }
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($userPath -split ";") -contains $bin)) {
  [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";"), $bin) -join ";").TrimStart(";"), "User")
  Write-Host "pilearn: added $bin to your PATH. Open a new terminal, then run: pilearn"
}
