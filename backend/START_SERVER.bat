@echo off
echo ====================================
echo  MproWave Backend API Server
echo ====================================
echo.
echo Starting Laravel development server...
echo Binding to all network interfaces on port 8000 so a phone on the
echo same WiFi can reach it at http://YOUR-COMPUTER-IP:8000
echo (run "ipconfig" to find your IPv4 address).
echo.
echo Press Ctrl+C to stop the server
echo ====================================
echo.

php artisan serve --host=0.0.0.0 --port=8000

pause
