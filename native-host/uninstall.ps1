# native-host/uninstall.ps1
# Removes the Claude Folders helper that install.ps1 set up for the current Windows user.
# Removes: HKCU ...\NativeMessagingHosts\com.plexpixel.claude_folders for Chrome and Brave, and
#          %LOCALAPPDATA%\ClaudeFolders\native-host\
# Notes: docs/notes/native-host/uninstall.ps1.md

$ErrorActionPreference = 'Stop'
$hostName = 'com.plexpixel.claude_folders'
$target = Join-Path $env:LOCALAPPDATA 'ClaudeFolders\native-host'

foreach ($root in 'HKCU:\Software\Google\Chrome\NativeMessagingHosts', 'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts') {
  $key = Join-Path $root $hostName
  if (Test-Path -LiteralPath $key) {
    Remove-Item -LiteralPath $key -Force
    Write-Host "Removed $key"
  }
}
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
  Write-Host "Removed $target"
}
