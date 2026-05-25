@echo off
REM Inicia o gerenciador em modo desenvolvimento (precisa de Python + PySide6).
cd /d "%~dp0"
python -m server_app_manager
