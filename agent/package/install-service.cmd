@echo off
REM ============================================================================
REM NN-LRMS agent — ติดตั้งเป็น Windows service
REM รันด้วยสิทธิ์ Administrator: install-service.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

if not exist agent.config.json (
  echo ยังไม่มี agent.config.json — คัดลอกจาก agent.example.json แล้วกรอกให้ครบก่อน
  exit /b 1
)

net session >nul 2>&1
if errorlevel 1 (
  echo ต้องเปิดด้วยสิทธิ์ Administrator (คลิกขวาที่ไฟล์นี้ ^> Run as administrator)
  exit /b 1
)

echo == ติดตั้ง service ==
NN-LRMS-agent-service.exe install
if errorlevel 1 (
  echo ติดตั้งไม่สำเร็จ
  exit /b 1
)

echo == เริ่ม service ==
NN-LRMS-agent-service.exe start

echo.
echo ติดตั้งเสร็จ — ตรวจสถานะ: NN-LRMS-agent-service.exe status
echo log อยู่ที่ logs\NN-LRMS-agent-service.out.log
endlocal
