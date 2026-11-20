@echo off
REM ============================================================================
REM NN-LRMS agent — ถอนการติดตั้ง Windows service
REM รันด้วยสิทธิ์ Administrator: uninstall-service.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo ต้องเปิดด้วยสิทธิ์ Administrator
  exit /b 1
)

echo == หยุด service ==
NN-LRMS-agent-service.exe stop
echo == ถอนการติดตั้ง ==
NN-LRMS-agent-service.exe uninstall

echo.
echo ถอนแล้ว (ไฟล์และโฟลเดอร์ logs\ ยังอยู่ ลบเองได้ถ้าต้องการ)
endlocal
