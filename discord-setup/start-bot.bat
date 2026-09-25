@echo off
rem Lance le bot constructeur du serveur Discord.
rem Le token est lu dans token.txt (jamais dans le code).
chcp 65001 >nul
cd /d "%~dp0"

rem Emojis dans la console Windows (sinon UnicodeEncodeError cp1252)
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

rem 1 = accueil (role auto, DM) + sondage de depart. Necessite SERVER MEMBERS INTENT coche dans le portail.
if "%MEMBERS%"=="" set MEMBERS=1

if not exist token.txt (
  type nul > token.txt
  echo Colle le token du bot dans token.txt puis relance ce fichier.
  pause
  exit /b 1
)
set /p DISCORD_TOKEN=<token.txt
if "%DISCORD_TOKEN%"=="" (
  echo token.txt est vide : colle le token du bot dedans puis relance.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python n'est pas installe : https://www.python.org/downloads/ ^(coche "Add to PATH"^)
  pause
  exit /b 1
)

echo Installation / mise a jour de discord.py...
python -m pip install --quiet --disable-pip-version-check "discord.py>=2.3,<3"

echo Demarrage du bot (Ctrl+C pour l'arreter)...
python -u setup.py
pause
