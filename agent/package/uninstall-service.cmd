@echo off
chcp 65001 >nul
REM ============================================================================
REM NN-LRMS agent — ถอนการติดตั้ง Windows service
REM รันด้วยสิทธิ์ Administrator: uninstall-service.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  fltmc >nul 2>&1
  if errorlevel 1 (
    echo [X] ต้องเปิดด้วยสิทธิ์ Administrator
    echo     คลิกขวาที่ไฟล์นี้ ^> Run as administrator
    if /I not "%~1"=="--no-pause" pause
    exit /b 1
  )
)

echo == หยุด service ==
NN-LRMS-agent-service.exe stop <nul
echo == ถอนการติดตั้ง ==
NN-LRMS-agent-service.exe uninstall <nul

echo.
echo ถอนแล้ว ^(ไฟล์และโฟลเดอร์ logs\ ยังอยู่ ลบเองได้ถ้าต้องการ^)
if /I not "%~1"=="--no-pause" pause
endlocal
