@echo off
REM Starts the MproWave Python audio microservice (Demucs stem separation,
REM MIDI transcription, lyrics-to-song rendering) on port 8001.
REM
REM This must be running (alongside XAMPP's Apache + MySQL) whenever the app
REM needs: Stem Splitting, Audio-to-MIDI, or the Generate Song audio render.
REM It does NOT start automatically with Windows or with XAMPP — run this
REM script (or double-click it) each time before using those features, and
REM leave the window open. Closing the window stops the service.
cd /d "%~dp0"
call venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001
pause
