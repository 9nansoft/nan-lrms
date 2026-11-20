# NN-LRMS agent probe — ตรวจว่าเครื่องนี้ดึงข้อมูล HOSxP แบบไม่ต้องเปิด browser ได้ไหม
#
# วิธีใช้ (บนเครื่องห้องคลอดของ รพ. — Windows มี PowerShell อยู่แล้ว ไม่ต้องติดตั้งอะไร):
#   set GATEWAY_TOKEN=<gateway token ของเครื่องนี้>
#   powershell -ExecutionPolicy Bypass -File probe.ps1
#
# หรือใส่ "gatewayToken" ใน agent.config.json ข้างๆ ไฟล์นี้
#
# ขั้นตอนที่ probe นี้พิสูจน์:
#   1. local gateway 127.0.0.1:45011 ตอบ /api/GetBMSSessionID ไหม (ต้องมี gateway token)
#      → ได้ bms_session_id สด + bms_url + เวลาหมดอายุ (server กลางทำเองไม่ได้)
#   2. PasteJSON แลก session id เป็น bearer + URL ได้ไหม
#   3. ยิง SQL ผ่าน local gateway ได้ไหม (ทางเลือกที่ดีที่สุด — ไม่โดน rate limit ของ tunnel)
#   4. ยิง SQL ผ่าน BMS tunnel ได้ไหม (ทางสำรอง)
#   5. ดึงข้อมูลห้องคลอดออกมาได้จริงไหม (นับจำนวนเท่านั้น — ไม่พิมพ์ชื่อ/CID)
#
# ไฟล์นี้พิมพ์เฉพาะจำนวนและสถานะ ไม่พิมพ์ชื่อผู้ป่วย, CID, หรือ bearer token

$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

$LocalGateway = 'http://127.0.0.1:45011'
$AppId        = 'NN-LRMS.Agent'
$PasteJson    = 'https://hosxp.net/phapi/PasteJSON'

# Gateway token — อ่านจาก agent.config.json ข้างๆ ไฟล์นี้ หรือตั้ง env GATEWAY_TOKEN
$GatewayToken = $env:GATEWAY_TOKEN
if (-not $GatewayToken) {
  $cfgPath = Join-Path $PSScriptRoot 'agent.config.json'
  if (Test-Path $cfgPath) {
    try {
      $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
      if ($cfg.gatewayToken) { $GatewayToken = $cfg.gatewayToken }
    } catch {
      Write-Host "อ่าน agent.config.json ไม่ได้: $($_.Exception.Message)"
    }
  }
}
if (-not $GatewayToken) {
  Write-Host "ไม่พบ gateway token — ตั้งค่า env GATEWAY_TOKEN หรือใส่ gatewayToken ใน agent.config.json"
  Write-Host "แล้วรันอีกครั้ง"
  exit 1
}

function Say($msg) { Write-Host $msg }

# GET /api/GetBMSSessionID — the gateway hands out a live BMS session.
# Needs the gateway token; the answer carries the session id + tunnel URL.
function Get-GatewaySession {
  $headers = @{ Authorization = "Bearer $GatewayToken" }
  try {
    $r = Invoke-RestMethod -Uri "$LocalGateway/api/GetBMSSessionID" -Headers $headers -TimeoutSec 15
    if ($r.MessageCode -ne 200 -or -not $r.data.bms_session_id) {
      return @{ ok = $false; error = "gateway ตอบ MessageCode=$($r.MessageCode) ($($r.Message))" }
    }
    return @{
      ok              = $true
      bms_session_id  = $r.data.bms_session_id
      bms_url         = $r.data.bms_url
      expires_at      = $r.data.expires_at
      gateway_state   = $r.data.gateway_state
    }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

function Invoke-Sql($baseUrl, $bearer, $sql, $marketplaceToken) {
  $body = @{ sql = $sql; app = $AppId }
  if ($marketplaceToken) { $body['marketplace-token'] = $marketplaceToken }
  $headers = @{ Authorization = "Bearer $bearer" }
  try {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/sql" -Method Post -Headers $headers `
         -Body ($body | ConvertTo-Json -Depth 5) -ContentType 'application/json' -TimeoutSec 30
    return $r
  } catch {
    return $null
  }
}

function Row-Value($resp, $i = 0) {
  if (-not $resp) { return $null }
  if ($resp.PSObject.Properties.Name -contains 'rows' -and $resp.rows) {
    if ($resp.rows.Count -gt $i) { return $resp.rows[$i] }
    return $null
  }
  return $null
}

Say "=== NN-LRMS agent probe ==="
Say "เวลา: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say ""

# ── 1. local gateway ───────────────────────────────────────────────────────
Say "[1] local gateway $LocalGateway/api/GetBMSSessionID"
$gw = Get-GatewaySession
if ($gw.ok) {
  $sid = $gw.bms_session_id
  Say "    OK — ได้ bms_session_id (ยาว $($sid.Length) ตัวอักษร, ไม่พิมพ์ค่า)"
  if ($gw.bms_url) { Say "    bms_url = $($gw.bms_url)" }
  if ($gw.expires_at) { Say "    expires_at = $($gw.expires_at)" }
  if ($gw.gateway_state) { Say "    gateway_state = $($gw.gateway_state)" }
} else {
  Say "    FAIL — $($gw.error)"
  Say "          (ต้องเปิด HOSxP/BMS gateway บนเครื่องนี้ก่อน และต้องมี gateway token)"
  Say "          ถ้า gateway ไม่ได้ bind ที่ 45011 ให้ตรวจพอร์ตในไฟล์ตั้งค่า HOSxP"
  $sid = $null
}

# ── 2. PasteJSON ───────────────────────────────────────────────────────────
$bearer = $null; $bmsUrl = $null; $marketplaceToken = $null
if ($sid) {
  Say "[2] PasteJSON แลก session"
  try {
    $u = "$PasteJson" + "?Action=GET&code=" + [uri]::EscapeDataString($sid) + "&_=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $j = Invoke-RestMethod -Uri $u -TimeoutSec 30
    $ui = $j.result.user_info
    if ($ui) {
      $bmsUrl           = $ui.bms_url
      $bearer           = $ui.bms_session_code
      $marketplaceToken = $ui.marketplace_token
      if ($bmsUrl)  { Say "    OK — bms_url = $bmsUrl" }
      if ($bearer)  { Say "    OK — ได้ bearer (ยาว $($bearer.Length) ตัวอักษร, ไม่พิมพ์ค่า)" }
      if (-not $bearer) { Say "    WARN — ไม่ได้ bms_session_code → จะยิง SQL ไม่ได้" }
      if ($marketplaceToken) { Say "    OK — ได้ marketplace_token จาก session" }
      else { Say "    INFO — session ไม่มี marketplace_token (ทางแก้: อ่านจาก localStorage ของเบราว์เซอร์ที่เปิด NN-LRMS ไว้)" }
    } else {
      Say "    FAIL — ไม่มี result.user_info ในคำตอบ"
    }
  } catch {
    Say "    FAIL — PasteJSON error: $($_.Exception.Message)"
  }
} else {
  Say "[2] ข้าม — ไม่มี session id"
}

# ── 3/4. ยิง SQL ────────────────────────────────────────────────────────────
if ($bearer) {
  $testSql = "SELECT 1 as test"

  Say "[3] SQL ผ่าน local gateway ($LocalGateway/api/sql)"
  $rLocal = Invoke-Sql $LocalGateway $bearer $testSql $marketplaceToken
  if ($rLocal -and ($rLocal.MessageCode -eq 200)) {
    Say "    OK — local gateway ให้ข้อมูลตรง (ไม่โดน rate limit ของ tunnel, ไม่ถูก randomize)"
  } else {
    Say "    FAIL — local gateway ไม่ตอบ MessageCode=200 (ได้: $($rLocal.MessageCode) $($rLocal.Message))"
    Say "          แปลว่า agent ต้องใช้ tunnel แทน (ช้ากว่า + อาจโดน rate limit)"
  }

  Say "[4] SQL ผ่าน BMS tunnel ($bmsUrl/api/sql)"
  $rTunnel = Invoke-Sql $bmsUrl $bearer $testSql $marketplaceToken
  if ($rTunnel -and ($rTunnel.MessageCode -eq 200)) {
    Say "    OK — tunnel ใช้ได้ (ทางสำรอง)"
  } else {
    Say "    FAIL — tunnel ไม่ผ่าน (ได้: $($rTunnel.MessageCode) $($rTunnel.Message))"
  }

  # ── 5. ดึงข้อมูลห้องคลอด (นับเท่านั้น) ──────────────────────────────────
  Say "[5] นับผู้คลอดในห้องคลอดจาก HOSxP (นับเท่านั้น — ไม่พิมพ์ชื่อ/CID)"
  $mSql = @"
SELECT i.ipt_admit_type_id AS admit_type, COUNT(*) AS n
  FROM ipt i
  JOIN ward w ON w.ward = i.ward AND w.is_maternity_ward = 'Y'
 WHERE i.confirm_discharge = 'N'
 GROUP BY i.ipt_admit_type_id
 ORDER BY n DESC
"@
  foreach ($target in @(@('local', $LocalGateway), @('tunnel', $bmsUrl))) {
    $label = $target[0]; $url = $target[1]
    $r = Invoke-Sql $url $bearer $mSql $marketplaceToken
    if ($r -and ($r.MessageCode -eq 200) -and $r.rows) {
      $total = 0; $lines = @()
      foreach ($row in $r.rows) {
        $total += [int]$row.n
        $lines += ("admit_type=" + $row.admit_type + " n=" + $row.n)
      }
      Say "    $label : รวม $total ราย | " + ($lines -join ' | ')
    } else {
      Say "    $label : ไม่ได้ข้อมูล"
    }
  }
  Say ""
  Say "หมายเหตุ: agent ดึงเฉพาะ admit_type=3 (คลอดบุตร) เหมือน browser"
  Say "           ถ้า admit_type=1 (ทั่วไป) เป็นตัวเดียว แดชบอร์ดจะนับไม่ได้ (แก้ที่ HOSxP)"
} else {
  Say "[3-5] ข้าม — ไม่มี bearer"
}

Say ""
Say "=== จบ probe ==="
