# Builds this fork's desktop app as an unsigned NSIS installer and installs it for the current user. Quit OpenChamber first.
# Not 'Stop': Windows PowerShell treats native stderr as errors when output is redirected. Exit codes are checked instead.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')
if (Get-Process OpenChamber -ErrorAction SilentlyContinue) { throw 'OpenChamber is running; quit it first.' }
bun install --frozen-lockfile
if ($LASTEXITCODE) { throw "bun install failed ($LASTEXITCODE)" }
Push-Location packages/electron
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
bun run package --win nsis --x64
if ($LASTEXITCODE) { throw "package failed ($LASTEXITCODE)" }
Pop-Location
$installer = Get-ChildItem packages/electron/dist/OpenChamber-*-win-x64.exe | Select-Object -First 1
if (-not $installer) { throw 'Installer not found in packages/electron/dist' }
Start-Process $installer.FullName -ArgumentList '/S' -Wait
$shortcut = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\OpenChamber.lnk"
Write-Host "Installed $((New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath)"
