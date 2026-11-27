@echo off
chcp 65001 >nul
REM ============================================================================
REM NN-LRMS agent — รวบรวมอาการเพื่อหาสาเหตุว่าทำไม agent ไม่ขึ้น / service ไม่ทำงาน
REM รันด้วยสิทธิ์ Administrator: diagnose.cmd
REM ผลลัพธ์ทั้งหมดอยู่ใน diagnose-report.txt ข้างๆ ไฟล์นี้ — ส่งไฟล์นั้นให้ผู้ดูแลได้
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
set REPORT=%~dp0diagnose-report.txt

echo กำลังตรวจ… (ดูรายละเอียดใน %REPORT%) > %REPORT%

(
echo === NN-LRMS agent diagnose ===
echo เวลา: %DATE% %TIME%
echo โฟลเดอร์: %CD%
echo.

echo [1] ไฟล์ในโฟลเดอร์
dir /b >> %REPORT% 2>&1
echo. >> %REPORT%

echo [2] checksum เทียบกับ SHA256SUMS.txt
if not exist SHA256SUMS.txt (
  echo ไม่พบ SHA256SUMS.txt >> %REPORT%
) else (
  powershell -NoProfile -Command ^
    "$lines = Get-Content 'SHA256SUMS.txt' | Where-Object { $_.Trim() };" ^
    "foreach ($l in $lines) {" ^
    "  $parts = $l -split '\s{2}', 2;" ^
    "  if (-not (Test-Path $parts[1])) { Write-Output ('MISSING  ' + $parts[1]); continue };" ^
    "  $h = (Get-FileHash $parts[1] -Algorithm SHA256).Hash.ToLower();" ^
    "  if ($h -eq $parts[0]) { Write-Output ('OK       ' + $parts[1]) }" ^
    "  else { Write-Output ('MISMATCH ' + $parts[1] + '  (ไฟล์เสียหรือถูกแก้)'); }" ^
    "}" >> %REPORT% 2>&1
)
echo. >> %REPORT%

echo [3] ไฟล์ถูกบล็อกโดย Windows (Unblock) หรือเปิดได้หรือยัง >> %REPORT%
powershell -NoProfile -Command ^
  "$b = Get-ChildItem -File | Where-Object { Get-Item -Path $_.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue };" ^
  "if ($b) { $b | ForEach-Object { Write-Output ('BLOCKED  ' + $_.Name) } } else { Write-Output 'ไม่มีไฟล์ที่ถูกบล็อก' }" >> %REPORT% 2>&1
echo. >> %REPORT%

echo [4] ไฟล์ตั้งค่า >> %REPORT%
if exist agent.config.json (
  echo พบ agent.config.json >> %REPORT%
  powershell -NoProfile -Command ^
    "$c = Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
    "Write-Output ('  serverUrl        = ' + $c.serverUrl);" ^
    "Write-Output ('  intervalMinutes = ' + $c.intervalMinutes);" ^
    "Write-Output ('  localGateway     = ' + $c.localGateway);" ^
    "Write-Output ('  apiKey           = ' + $(if ($c.apiKey) { $c.apiKey.Substring(0, [Math]::Min(12, $c.apiKey.Length)) + '…' } else { '(ว่าง!)' }));" ^
    "Write-Output ('  gatewayToken     = ' + $(if ($c.gatewayToken) { 'มีค่า' } else { '(ว่าง!)' }));" ^
    "Write-Output ('  marketplaceToken = ' + $(if ($c.marketplaceToken) { 'มีค่า' } else { 'ไม่มี (ปกติ)' }))" >> %REPORT% 2>&1
) else (
  echo ไม่พบ agent.config.json — ต้องคัดลอกจาก agent.example.json >> %REPORT%
)
echo. >> %REPORT%

echo [5] รัน agent 12 วินาทีแล้วดูข้อความ >> %REPORT%
if exist nn-lrms-agent.exe (
  powershell -NoProfile -Command ^
    "if (Test-Path '.\agent.config.json') { $env:AGENT_CONFIG = (Resolve-Path '.\agent.config.json').Path };" ^
    "$p = Start-Process -FilePath '.\nn-lrms-agent.exe' -NoNewWindow -PassThru -RedirectStandardOutput '.\diag-agent.out.log' -RedirectStandardError '.\diag-agent.err.log';" ^
    "Start-Sleep -Seconds 12;" ^
    "if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; Write-Output 'agent ยังทำงานอยู่ (ปกติ)' }" ^
    "else { Write-Output ('agent จบการทำงานเอง exit=' + $p.ExitCode + ' — ดูข้อความด้านล่าง') }" >> %REPORT% 2>&1
  type diag-agent.out.log >> %REPORT% 2>&1
  type diag-agent.err.log >> %REPORT% 2>&1
  del diag-agent.out.log diag-agent.err.log >nul 2>&1
) else (
  echo ไม่พบ nn-lrms-agent.exe >> %REPORT%
)
echo. >> %REPORT%

echo [6] BMS gateway บนเครื่องนี้ + PasteJSON >> %REPORT%
powershell -NoProfile -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$c = Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "$gw = if ($c.localGateway) { $c.localGateway.TrimEnd('/') } else { 'http://127.0.0.1:45011' };" ^
  "try {" ^
  "  $r = Invoke-RestMethod -Uri ($gw + '/api/GetBMSSessionID') -Headers @{Authorization=('Bearer ' + $c.gatewayToken)} -TimeoutSec 10;" ^
  "  Write-Output ('  gateway_state = ' + $r.data.gateway_state + '  expires_at = ' + $r.data.expires_at);" ^
  "  if ($r.data.bms_session_id) {" ^
  "    $pj = Invoke-RestMethod -Uri ('https://hosxp.net/phapi/PasteJSON?Action=GET&code=' + [uri]::EscapeDataString($r.data.bms_session_id)) -TimeoutSec 15;" ^
  "    Write-Output ('  pastejson     = ' + $(if ($pj.result.user_info.bms_session_code -or $pj.result.key_value) { 'OK' } else { 'FAIL (no session code)' }))" ^
  "  }" ^
  "} catch { Write-Output ('  FAIL — ' + $_.Exception.Message) }" >> %REPORT% 2>&1
echo. >> %REPORT%

echo [7] ทดสอบ API Key กับเซิร์ฟเวอร์ (/api/sync/agent-push) >> %REPORT%
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$c = Get-Content 'agent.config.json' -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "$srv = $c.serverUrl.TrimEnd('/');" ^
  "try {" ^
  "  $r = Invoke-WebRequest -Uri ($srv + '/api/sync/agent-push') -Headers @{Authorization=('Bearer ' + $c.apiKey)} -TimeoutSec 15 -UseBasicParsing;" ^
  "  Write-Output ('  HTTP ' + $r.StatusCode + ' — OK')" ^
  "} catch {" ^
  "  $resp = $_.Exception.Response;" ^
  "  if ($resp) { Write-Output ('  FAIL — HTTP ' + [int]$resp.StatusCode) } else { Write-Output ('  FAIL — ' + $_.Exception.Message) }" ^
  "}" >> %REPORT% 2>&1
echo. >> %REPORT%

echo [8] service >> %REPORT%
echo -- sc query NN-LRMS-agent (ถาม Windows service manager ตรง ๆ) -- >> %REPORT%
sc query NN-LRMS-agent >> %REPORT% 2>&1
echo. >> %REPORT%
echo -- Get-Service -- >> %REPORT%
powershell -NoProfile -Command ^
  "Get-Service | Where-Object { $_.Name -like '*NN-LRMS*' -or $_.DisplayName -like '*NN-LRMS*' } | Format-Table Name,DisplayName,Status,StartType -AutoSize | Out-String -Width 200" >> %REPORT% 2>&1
echo -- WinSW status -- >> %REPORT%
if exist NN-LRMS-agent-service.exe (
  NN-LRMS-agent-service.exe status >> %REPORT% 2>&1
) else (
  echo ไม่พบ NN-LRMS-agent-service.exe >> %REPORT%
)
echo. >> %REPORT%

echo [9] log ของ service >> %REPORT%
if exist logs (
  dir /b logs >> %REPORT% 2>&1
  for %%F in (logs\*.log) do (
    echo. >> %REPORT%
    echo --- %%F --- >> %REPORT%
    type %%F >> %REPORT% 2>&1
  )
) else (
  echo ไม่มีโฟลเดอร์ logs — ยังไม่เคยรัน service >> %REPORT%
)

echo.
echo เสร็จแล้ว — ดูรายละเอียดใน %REPORT%
echo (ส่งไฟล์ diagnose-report.txt ให้ผู้ดูแลระบบ)
endlocal
