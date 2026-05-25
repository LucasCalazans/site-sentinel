@echo off
REM Gera um executavel unico (ServerAppManager.exe) em dist\.
cd /d "%~dp0"
python -m pip install -r requirements.txt
python -m pip install pyinstaller
pyinstaller --noconfirm --windowed --onefile --name "ServerAppManager" main.py
echo.
echo Pronto: dist\ServerAppManager.exe
