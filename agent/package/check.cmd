@echo off
REM ============================================================================
REM NN-LRMS agent — ตรวจว่าเครื่องนี้พร้อมรัน agent หรือยัง
REM รันด้วยสิทธิ์ Administrator: check.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

echo == 1/4 ไฟล์ตั้งค่า ==
if exist agent.config.json (
  echo    OK — พบ agent.config.json
) else (
  echo    ยังไม่มี agent.config.json
  echo    คัดลอกจาก agent.example.json แล้วใส่ serverUrl / apiKey / gatewayToken
  echo    แล้วรัน check.cmd อีกครั้ง
  exit /b 1
)

echo == 2/4 ตัว agent ==
if exist nn-lrms-agent.exe (
  echo    OK — พบ nn-lrms-agent.exe
) else (
  echo    FAIL — ไม่พบ nn-lrms-agent.exe (แตกแพ็กผิดโฟลเดอร์?)
  exit /b 1
)

echo == 3/4 BMS gateway บนเครื่องนี้ (127.0.0.1:45011) ==
powershell -NoProfile -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$c=Get-Content 'agent.config.json' -Raw | ConvertFrom-Json;" ^
  "try {" ^
  "  $r=Invoke-RestMethod -Uri ($c.localGateway + '/api/GetBMSSessionID') -Headers @{Authorization=('Bearer ' + $c.gatewayToken)} -TimeoutSec 10;" ^
  "  if ($r.data.bms_session_id) { Write-Host ('    OK — gateway_state=' + $r.data.gateway_state + ' expires_at=' + $r.data.expires_at) }" ^
  "  else { Write-Host '    FAIL — gateway ไม่ได้ส่ง bms_session_id'; exit 1 }" ^
  "} catch { Write-Host ('    FAIL — ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1

echo == 4/4 เซิร์ฟเวอร์ NN-LRMS ==
powershell -NoProfile -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$c=Get-Content 'agent.config.json' -Raw | ConvertFrom-Json;" ^
  "try {" ^
  "  $r=Invoke-WebRequest -Uri ($c.serverUrl + '/api/health') -TimeoutSec 15 -UseBasicParsing;" ^
  "  Write-Host ('    OK — HTTP ' + $r.StatusCode)" ^
  "} catch { Write-Host ('    FAIL — ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1

echo.
echo ผ่านทุกข้อ — ติดตั้ง service ได้: install-service.cmd
endlocal
