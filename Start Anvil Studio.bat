@echo off
cd /d "%~dp0"
py serve.py
if errorlevel 1 pause
