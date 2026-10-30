@echo off
rem Starts LockScope with its bundled Java runtime. Use this if Windows blocks LockScope.exe
rem (Smart App Control blocks apps that are not code-signed; see docs/installing.md).
start "" "%~dp0runtime\bin\javaw.exe" -cp "%~dp0app\*" io.lockscope.server.DesktopApp %*
