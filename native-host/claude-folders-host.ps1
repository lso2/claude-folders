# native-host/claude-folders-host.ps1
# Claude Folders helper: opens File Explorer with an exported chat selected, for the extension.
# Chrome starts it once per message through claude-folders-host.cmd and reads one framed reply.
# Reads: host-config.json beside this script, { "dataFolder": "<absolute path>" }, written by install.ps1
# Notes: docs/notes/native-host/claude-folders-host.ps1.md

$ErrorActionPreference = 'Stop'

# Chrome frames each message as a 32-bit little-endian length followed by that many bytes of UTF-8 JSON
function Read-FramedMessage([System.IO.Stream]$stream) {
  $header = New-Object byte[] 4
  $read = 0
  while ($read -lt 4) {
    $n = $stream.Read($header, $read, 4 - $read)
    if ($n -le 0) { return $null }
    $read += $n
  }
  $length = [BitConverter]::ToInt32($header, 0)
  $body = New-Object byte[] $length
  $read = 0
  while ($read -lt $length) {
    $n = $stream.Read($body, $read, $length - $read)
    if ($n -le 0) { return $null }
    $read += $n
  }
  return [Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json
}

function Write-FramedMessage([System.IO.Stream]$stream, $reply) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($reply | ConvertTo-Json -Compress))
  $stream.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
}

# The export is <data folder>\chats\<filename>, or the first file there starting with "<prefix>_"
function Get-Reply($request) {
  if ($request.action -ne 'reveal') {
    return @{ ok = $false; code = 'bad-request'; error = "Unknown action: $($request.action)" }
  }
  $configPath = Join-Path $PSScriptRoot 'host-config.json'
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    return @{ ok = $false; code = 'config'; error = "No host-config.json in $PSScriptRoot" }
  }
  $dataFolder = [string](Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).dataFolder
  if (-not $dataFolder -or -not (Test-Path -LiteralPath $dataFolder -PathType Container)) {
    return @{ ok = $false; code = 'config'; error = "The data folder in host-config.json does not exist: $dataFolder" }
  }
  $folderName = [string]$request.folderName
  if ($folderName -and (Split-Path -Leaf $dataFolder) -ne $folderName) {
    return @{ ok = $false; code = 'folder'; error = "The helper is set up for $dataFolder, and the extension's data folder is named $folderName" }
  }

  $chats = Join-Path $dataFolder 'chats'
  $name = [string]$request.filename
  $prefix = [string]$request.prefix
  $file = $null
  if ($name) {
    if ($name -notmatch '^[^\\/:*?"<>|]+\.md$') {
      return @{ ok = $false; code = 'bad-request'; error = "Not an export file name: $name" }
    }
    $candidate = Join-Path $chats $name
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $file = $candidate }
  }
  if (-not $file -and $prefix) {
    if ($prefix -notmatch '^[A-Za-z0-9_]+$') {
      return @{ ok = $false; code = 'bad-request'; error = "Not an export id prefix: $prefix" }
    }
    if (Test-Path -LiteralPath $chats -PathType Container) {
      $match = Get-ChildItem -LiteralPath $chats -File |
        Where-Object { $_.Extension -eq '.md' -and $_.Name.StartsWith($prefix + '_', [StringComparison]::OrdinalIgnoreCase) } |
        Sort-Object Name | Select-Object -First 1
      if ($match) { $file = $match.FullName }
    }
  }
  if (-not $file) {
    $looked = @()
    if ($name) { $looked += "named $name" }
    if ($prefix) { $looked += "starting with ${prefix}_" }
    return @{ ok = $false; code = 'not-found'; error = "No export $($looked -join ' or ') is in $chats" }
  }

  Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList "/select,`"$file`""
  return @{ ok = $true; path = $file }
}

$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
$request = Read-FramedMessage $stdin
if ($null -ne $request) {
  try {
    $reply = Get-Reply $request
  } catch {
    $reply = @{ ok = $false; code = 'helper'; error = "$($_.Exception.GetType().Name): $($_.Exception.Message)" }
  }
  Write-FramedMessage $stdout $reply
}
