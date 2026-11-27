@echo off
chcp 65001 >nul
REM ============================================================================
REM NN-LRMS agent — ตรวจว่าเครื่องนี้พร้อมรัน agent หรือยัง
REM รันด้วยสิทธิ์ Administrator: check.cmd
REM ============================================================================
setlocal
cd /d "%~dp0"

echo == 1/5 ไฟล์ตั้งค่า ==
if not exist agent.config.json (
  echo    FAIL — ยังไม่มี agent.config.json
  echo    คัดลอกจาก agent.example.json แล้วใส่ serverUrl / apiKey / gatewayToken
  echo    แล้วรัน check.cmd อีกครั้ง
  exit /b 1
)
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "try { $c=Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json } catch { Write-Host ('    FAIL — agent.config.json ไม่ใช่ JSON ที่ถูกต้อง: ' + $_.Exception.Message); exit 1 };" ^
  "if (-not $c.serverUrl) { Write-Host '    FAIL — ไม่มี serverUrl ใน agent.config.json'; exit 1 };" ^
  "if (-not $c.apiKey -or $c.apiKey -match 'xxxx') { Write-Host '    FAIL — apiKey ว่างหรือยังเป็นค่าตัวอย่าง'; exit 1 };" ^
  "if (-not $c.gatewayToken -or $c.gatewayToken -match 'ใส่ gateway token') { Write-Host '    FAIL — gatewayToken ว่างหรือยังเป็นค่าตัวอย่าง'; exit 1 };" ^
  "Write-Host ('    OK — serverUrl=' + $c.serverUrl + ' localGateway=' + $(if ($c.localGateway) { $c.localGateway } else { 'http://127.0.0.1:45011' }))"
if errorlevel 1 exit /b 1

echo == 2/5 ตัว agent และตำแหน่งโฟลเดอร์ ==
if exist nn-lrms-agent.exe (
  echo    OK — พบ nn-lrms-agent.exe
) else (
  echo    FAIL — ไม่พบ nn-lrms-agent.exe (แตกแพ็กผิดโฟลเดอร์?)
  exit /b 1
)
echo %CD% | findstr /I /B "C:\Users\" >nul
if not errorlevel 1 (
  echo    WARN — โฟลเดอร์อยู่ใน C:\Users\... บัญชี LocalService ของ Windows service อาจไม่มีสิทธิ์อ่าน
  echo           แนะนำให้ย้ายไปไว้ที่ C:\NN-LRMS-agent\ ก่อนติดตั้ง service
)

echo == 3/5 BMS gateway บนเครื่องนี้ + PasteJSON ==
powershell -NoProfile -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$c=Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "$gw=if ($c.localGateway) { $c.localGateway.TrimEnd('/') } else { 'http://127.0.0.1:45011' };" ^
  "try {" ^
  "  $r=Invoke-RestMethod -Uri ($gw + '/api/GetBMSSessionID') -Headers @{Authorization=('Bearer ' + $c.gatewayToken)} -TimeoutSec 10;" ^
  "  if (-not $r.data.bms_session_id) { Write-Host '    FAIL — gateway ไม่ได้ส่ง bms_session_id'; exit 1 };" ^
  "  Write-Host ('    OK — gateway_state=' + $r.data.gateway_state + ' expires_at=' + $r.data.expires_at);" ^
  "  $pj=Invoke-RestMethod -Uri ('https://hosxp.net/phapi/PasteJSON?Action=GET&code=' + [uri]::EscapeDataString($r.data.bms_session_id)) -TimeoutSec 15;" ^
  "  if ($pj.result.user_info.bms_session_code -or $pj.result.key_value) { Write-Host '    OK — PasteJSON (hosxp.net) แลก session สำเร็จ' }" ^
  "  else { Write-Host '    FAIL — PasteJSON ตอบกลับมาแต่ไม่มี session code (ตรวจสอบเน็ตออก hosxp.net)'; exit 1 }" ^
  "} catch { Write-Host ('    FAIL — ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1

echo == 4/5 เซิร์ฟเวอร์ NN-LRMS (/api/health) ==
powershell -NoProfile -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$c=Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "$srv=$c.serverUrl.TrimEnd('/');" ^
  "try {" ^
  "  $r=Invoke-WebRequest -Uri ($srv + '/api/health') -TimeoutSec 15 -UseBasicParsing;" ^
  "  Write-Host ('    OK — HTTP ' + $r.StatusCode)" ^
  "} catch { Write-Host ('    FAIL — ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 exit /b 1

echo == 5/5 สิทธิ์ API Key กับเซิร์ฟเวอร์ (/api/sync/agent-push) ==
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$c=Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "$srv=$c.serverUrl.TrimEnd('/');" ^
  "try {" ^
  "  $r=Invoke-WebRequest -Uri ($srv + '/api/sync/agent-push') -Headers @{Authorization=('Bearer ' + $c.apiKey)} -TimeoutSec 15 -UseBasicParsing;" ^
  "  Write-Host ('    OK — API Key ใช้งานได้ (HTTP ' + $r.StatusCode + ')')" ^
  "} catch {" ^
  "  $resp=$_.Exception.Response;" ^
  "  if ($resp) { $code=[int]$resp.StatusCode; Write-Host ('    FAIL — HTTP ' + $code + ' (ตรวจสอบ apiKey / scope / สถานะ รพ. ในแอดมิน)') } else { Write-Host ('    FAIL — ' + $_.Exception.Message) };" ^
  "  exit 1" ^
  "}"
if errorlevel 1 exit /b 1

echo.
echo ผ่านทุกข้อ — ติดตั้ง service ได้: install-service.cmd
endlocal
