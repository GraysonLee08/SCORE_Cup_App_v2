@echo off
echo Starting SCORES Cup Tournament App in Development Mode
echo.

echo Installing frontend dependencies...
cd frontend
if not exist package.json (
    echo Error: package.json not found in frontend directory
    pause
    exit /b 1
)
call npm install
if errorlevel 1 (
    echo Error installing frontend dependencies
    pause
    exit /b 1
)

echo.
echo Installing backend dependencies...
cd ..\backend
if not exist package.json (
    echo Error: package.json not found in backend directory
    pause
    exit /b 1
)
call npm install
if errorlevel 1 (
    echo Error installing backend dependencies
    pause
    exit /b 1
)

echo.
echo Starting database...
cd ..
docker-compose up -d tournament_db

echo Waiting for database to start...
timeout /t 10 /nobreak >nul

echo.
echo Starting backend server...
start "Backend Server" cmd /c "cd backend && npm start"

echo.
echo Starting frontend development server...
start "Frontend Server" cmd /c "cd frontend && npm start"

echo.
echo ===================================
echo SCORES Cup Tournament App Started!
echo ===================================
echo.
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:3002
echo Admin Panel: http://localhost:3000/admin
echo Display Screen: http://localhost:3000/
echo.
echo Press any key to exit...
pause >nul