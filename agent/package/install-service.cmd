@echo off
chcp 65001 >nul
REM ============================================================================
REM NN-LRMS agent — ติดตั้งเป็น Windows service
REM รันด้วยสิทธิ์ Administrator: คลิกขวา ^> Run as administrator
REM ใส่พารามิเตอร์ --no-pause หากเรียกจากสคริปต์อัตโนมัติ
REM ============================================================================
setlocal
cd /d "%~dp0"

if not exist agent.config.json (
  echo [X] ยังไม่มี agent.config.json — คัดลอกจาก agent.example.json แล้วกรอกให้ครบก่อน
  echo     ต้องมี: serverUrl / apiKey / gatewayToken
  goto :fail
)

REM ตรวจสิทธิ์ Administrator (ใช้ทั้ง net session และ fltmc เผื่อเครื่องปิด LanmanServer)
net session >nul 2>&1
if errorlevel 1 (
  fltmc >nul 2>&1
  if errorlevel 1 (
    echo [X] ต้องเปิดด้วยสิทธิ์ Administrator
    echo     คลิกขวาที่ไฟล์นี้ ^> Run as administrator
    goto :fail
  )
)

if not exist NN-LRMS-agent-service.exe (
  echo [X] ไม่พบ NN-LRMS-agent-service.exe ^(แตกแพ็กผิดโฟลเดอร์?^)
  goto :fail
)

if not exist NN-LRMS-agent-service.xml (
  echo [X] ไม่พบ NN-LRMS-agent-service.xml ^(แตกแพ็กไม่ครบ?^)
  goto :fail
)

if not exist nn-lrms-agent.exe (
  echo [X] ไม่พบ nn-lrms-agent.exe ^(แตกแพ็กไม่ครบ?^)
  goto :fail
)

echo %CD% | findstr /I /C:"\Users\" >nul
if not errorlevel 1 (
  echo [!] คำเตือน: โฟลเดอร์อยู่ใน C:\Users\... บัญชี LocalService ของ service อาจติดสิทธิ์เข้าถึง
  echo     แนะนำให้ย้ายทั้งโฟลเดอร์ไปไว้ที่ C:\NN-LRMS-agent\
)

echo == 1/5 ปลดบล็อกไฟล์ที่โหลดมาจากอินเทอร์เน็ต ^(Zone.Identifier^) ==
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -File | Unblock-File" >nul 2>&1

echo == 2/5 ตั้งสิทธิ์โฟลเดอร์และ logs ให้บัญชี LocalService ==
if not exist logs mkdir logs
icacls "%CD%" /grant "*S-1-5-19":(OI)(CI)RX /Q >nul 2>&1
icacls "%CD%\logs" /grant "*S-1-5-19":(OI)(CI)M /T /Q >nul 2>&1

sc query NN-LRMS-agent >nul 2>&1
if not errorlevel 1 (
  echo [i] พบ service เดิม NN-LRMS-agent — กำลังถอนการติดตั้งเดิมก่อนติดตั้งใหม่...
  sc stop NN-LRMS-agent >nul 2>&1
  timeout /t 2 /nobreak >nul
  NN-LRMS-agent-service.exe uninstall <nul >nul 2>&1
  sc query NN-LRMS-agent >nul 2>&1
  if not errorlevel 1 (
    sc delete NN-LRMS-agent >nul 2>&1
    timeout /t 2 /nobreak >nul
  )
)

echo == 3/5 ติดตั้ง service ==
NN-LRMS-agent-service.exe install <nul
if errorlevel 1 (
  echo [X] คำสั่ง install ล้มเหลว ^(ดูข้อความจาก WinSW ข้างบน^)
  if exist NN-LRMS-agent-service.wrapper.log type NN-LRMS-agent-service.wrapper.log
  if exist logs\NN-LRMS-agent-service.wrapper.log type logs\NN-LRMS-agent-service.wrapper.log
  goto :fail
)

echo == 4/5 ตรวจว่า service ถูกลงทะเบียนจริง ==
sc query NN-LRMS-agent
if errorlevel 1 (
  echo [X] service ไม่ถูกลงทะเบียน — ดูข้อความจาก WinSW ข้างบน
  goto :fail
)

echo == 5/5 เริ่ม service และตรวจสถานะ RUNNING ==
NN-LRMS-agent-service.exe start <nul
if errorlevel 1 (
  echo [!] start ไม่สำเร็จ — ดู log: logs\NN-LRMS-agent-service.err.log และ wrapper.log
  if exist logs\NN-LRMS-agent-service.wrapper.log type logs\NN-LRMS-agent-service.wrapper.log
  if exist logs\NN-LRMS-agent-service.err.log type logs\NN-LRMS-agent-service.err.log
  goto :fail
)

timeout /t 3 /nobreak >nul
sc query NN-LRMS-agent
sc query NN-LRMS-agent | findstr /C:"RUNNING" >nul
if errorlevel 1 (
  echo.
  echo [!] คำเตือน: service ไม่ได้อยู่ในสถานะ RUNNING — น่าจะดับหลังเริ่มทำงาน
  echo     ตรวจดู log: logs\NN-LRMS-agent-service.err.log และ logs\NN-LRMS-agent-service.out.log
  echo     หรือรัน diagnose.cmd แล้วส่ง diagnose-report.txt ให้ผู้ดูแลระบบ
  goto :fail
)

echo.
echo ติดตั้งและเริ่ม service สำเร็จ — ดู log: logs\NN-LRMS-agent-service.out.log
echo ถ้าต้องการรายงานปัญหา: รัน diagnose.cmd
if /I not "%~1"=="--no-pause" pause
endlocal
exit /b 0

:fail
echo.
if /I not "%~1"=="--no-pause" pause
endlocal
exit /b 1
