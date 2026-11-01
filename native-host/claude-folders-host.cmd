@echo off
rem native-host/claude-folders-host.cmd
rem Starts the Claude Folders helper. Chrome runs this file for each native message.
rem Notes: docs/notes/native-host/claude-folders-host.cmd.md
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0claude-folders-host.ps1"
