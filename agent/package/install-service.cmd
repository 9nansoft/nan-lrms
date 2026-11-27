@echo off
REM ============================================================================
REM NN-LRMS agent — ติดตั้งเป็น Windows service
REM รันด้วยสิทธิ์ Administrator: install-service.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

if not exist agent.config.json (
  echo [X] ยังไม่มี agent.config.json — คัดลอกจาก agent.example.json แล้วกรอกให้ครบก่อน
  echo     ต้องมี: serverUrl / apiKey / gatewayToken
  exit /b 1
)

REM ต้องเป็น Administrator — service ใหม่ต้องสร้างโดยผู้ดูแลระบบ
net session >nul 2>&1
if errorlevel 1 (
  echo [X] ต้องเปิดด้วยสิทธิ์ Administrator
  echo     คลิกขวาที่ไฟล์นี้ ^> Run as administrator
  exit /b 1
)

if not exist NN-LRMS-agent-service.exe (
  echo [X] ไม่พบ NN-LRMS-agent-service.exe (แตกแพ็กผิดโฟลเดอร์?)
  exit /b 1
)

echo %CD% | findstr /I /B "C:\Users\" >nul
if not errorlevel 1 (
  echo [!] คำเตือน: โฟลเดอร์อยู่ใน C:\Users\... บัญชี LocalService ของ service อาจไม่มีสิทธิ์อ่าน
  echo     หาก service ไม่ขึ้น ให้ย้ายทั้งโฟลเดอร์ไปไว้ที่ C:\NN-LRMS-agent\
)

echo == 1/4 ติดตั้ง service ==
NN-LRMS-agent-service.exe install
if errorlevel 1 (
  echo [X] คำสั่ง install ล้มเหลว (ดูข้อความจาก WinSW ข้างบน)
  exit /b 1
)

echo == 2/4 ตรวจว่า service ถูกลงทะเบียนจริง ==
sc query NN-LRMS-agent
if errorlevel 1 (
  echo [X] service ไม่ถูกลงทะเบียน — ดูข้อความจาก WinSW ข้างบน
  echo     ถ้าเป็น "Access denied" ให้รันคำสั่งนี้ใน PowerShell แบบ Administrator
  exit /b 1
)

echo == 3/4 เริ่ม service ==
NN-LRMS-agent-service.exe start
if errorlevel 1 (
  echo [!] start ไม่สำเร็จ — ดู log: logs\NN-LRMS-agent-service.err.log
  exit /b 1
)

echo == 4/4 รอ 3 วินาทีแล้วตรวจว่า service ยังทำงานอยู่จริง ==
timeout /t 3 /nobreak >nul
sc query NN-LRMS-agent
sc query NN-LRMS-agent | findstr /C:"RUNNING" >nul
if errorlevel 1 (
  echo.
  echo [!] คำเตือน: service ไม่ได้อยู่ในสถานะ RUNNING — น่าจะดับหลังเริ่มทำงาน
  echo     ตรวจดู log: logs\NN-LRMS-agent-service.err.log และ logs\NN-LRMS-agent-service.out.log
  echo     หรือรัน diagnose.cmd แล้วส่ง diagnose-report.txt ให้ผู้ดูแลระบบ
  exit /b 1
)
echo.
echo ติดตั้งเสร็จ — ดู log: logs\NN-LRMS-agent-service.out.log
echo ถ้าต้องการรายงานปัญหา: รัน diagnose.cmd
endlocal
