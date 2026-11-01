# native-host/install.ps1
# Installs the Claude Folders helper for the current Windows user and registers it with Chrome and Brave.
# Parameters: -ExtensionId, the extension's id in chrome://extensions; -DataFolder, the extension's data
#             folder, chosen in a folder dialog when left out
# Writes: %LOCALAPPDATA%\ClaudeFolders\native-host\ and HKCU ...\NativeMessagingHosts\com.plexpixel.claude_folders
# Notes: docs/notes/native-host/install.ps1.md
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId,
  [string]$DataFolder
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.plexpixel.claude_folders'
$target = Join-Path $env:LOCALAPPDATA 'ClaudeFolders\native-host'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not $DataFolder) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'Choose the Claude Folders data folder, the one with the chats folder in it'
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No data folder was chosen' }
  $DataFolder = $dialog.SelectedPath
}
if (-not (Test-Path -LiteralPath $DataFolder -PathType Container)) { throw "The data folder does not exist: $DataFolder" }
$DataFolder = (Resolve-Path -LiteralPath $DataFolder).Path

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'claude-folders-host.ps1') -Destination $target -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'claude-folders-host.cmd') -Destination $target -Force
[IO.File]::WriteAllText((Join-Path $target 'host-config.json'), (@{ dataFolder = $DataFolder } | ConvertTo-Json), $utf8)

# Chrome refuses a manifest whose allowed_origins lack the calling extension
$manifestPath = Join-Path $target "$hostName.json"
$manifest = [ordered]@{
  name = $hostName
  description = 'Opens the Claude Folders data folder in File Explorer'
  path = (Join-Path $target 'claude-folders-host.cmd')
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), $utf8)

# Each browser reads its own key. A browser not installed for this user gets none.
$registered = @()
$browsers = [ordered]@{
  'Chrome' = 'HKCU:\Software\Google\Chrome'
  'Brave' = 'HKCU:\Software\BraveSoftware\Brave-Browser'
}
foreach ($browser in $browsers.Keys) {
  $root = $browsers[$browser]
  if (-not (Test-Path -LiteralPath $root)) { continue }
  $hosts = Join-Path $root 'NativeMessagingHosts'
  if (-not (Test-Path -LiteralPath $hosts)) { New-Item -Path $hosts | Out-Null }
  New-Item -Path (Join-Path $hosts $hostName) -Value $manifestPath -Force | Out-Null
  $registered += $browser
}
if (-not $registered.Count) { throw 'Neither HKCU:\Software\Google\Chrome nor HKCU:\Software\BraveSoftware\Brave-Browser exists for this user' }

Write-Host "Claude Folders helper installed in $target"
Write-Host "Data folder: $DataFolder"
Write-Host "Extension id: $ExtensionId"
Write-Host "Registered for: $($registered -join ', ')"
