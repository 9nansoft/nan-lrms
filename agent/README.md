# NN-LRMS agent — ซิงค์ข้อมูล HOSxP โดยไม่ต้องเปิดเบราว์เซอร์

> คู่มือนี้สำหรับ**โรงพยาบาล** (ติดตั้ง + ใช้งาน) — คนที่จะ**สร้าง**ไฟล์ agent ดู [`BUILD.md`](BUILD.md)

ทำไมต้องมี

ระบบดึงข้อมูลห้องคลอด/ฝากครรภ์จาก HOSxP เข้าแคชกลาง (เพื่อให้แดชบอร์ดภาพรวมจังหวัดเห็นตัวเลข)
มี 2 ทาง:

1. **เบราว์เซอร์** — เจ้าหน้าที่เปิดหน้า NN-LRMS ค้างไว้ แล้วเบราว์เซอร์ดึงข้อมูลจาก HOSxP
   เองทุก 60 วินาที (ผ่าน BMS gateway ในเครื่อง `127.0.0.1:45011`) แล้วส่งเข้าเซิร์ฟเวอร์
2. **agent** (ตัวนี้) — โปรแกรมเล็ก ๆ ที่รันอยู่บนเครื่องห้องคลอดตลอด 24 ชั่วโมง
   ทำงานเหมือนข้อ 1 แต่ไม่ต้องมีคนเปิดเบราว์เซอร์

ถ้าไม่มีทั้งสองทาง → แดชบอร์ดจะไม่มีตัวเลขใหม่ (หน้าห้องคลอดที่เปิดจาก HOSxP ยังเห็นข้อมูลสดเสมอ
เพราะอ่าน HOSxP โดยตรง)

agent ทำงานทุก 5 นาที (ตั้งค่าได้) → ข้อมูลสูงสุดที่ค้างไม่เกิน 5–15 นาที

## สิ่งที่ agent ทำต่อรอบ

1. `GET http://127.0.0.1:45011/api/GetBMSSessionID` (ส่ง `Authorization: Bearer <gateway token>`)
   — เอา `bms_session_id` สด + `bms_url` + เวลาหมดอายุ จาก BMS gateway ในเครื่อง
   (ชิ้นที่เซิร์ฟเวอร์กลางทำเองไม่ได้ เพราะ endpoint นี้มีแค่บน local gateway)
   **ดึงใหม่ทุกรอบ** — gateway ต่ออายุ session เองแล้วหมดอายุตามเวลา
2. แลก session id เป็น bearer token ผ่าน `https://hosxp.net/phapi/PasteJSON`
3. ดึงชุดข้อมูลเดียวกับที่เบราว์เซอร์ดึง: ผู้คลอดในห้องคลอด, partograph, ANC, ANC lab,
   ข้อมูลทารกใหม่, ข้อมูลการส่งต่อ — ถ้า local gateway ตอบได้จะดึงจากมันตรง ๆ
   (ไม่โดน rate limit ของ tunnel, ได้ข้อมูลจริง ไม่ถูกสุ่ม CID/HN)
4. ส่งข้อมูลเข้า `POST <serverUrl>/api/sync/agent-push` ด้วย API key ของโรงพยาบาลนั้น
   (ฝั่งเซิร์ฟเวอร์เขียนข้อมูลลงแคชด้วยโค้ดชุดเดียวกับที่เบราว์เซอร์ใช้)
5. ส่ง heartbeat บอกเซิร์ฟเวอร์ว่า "agent ยังทำงานอยู่" — ถ้าเงียบไปเกิน 20 นาที
   เซิร์ฟเวอร์จะดึงข้อมูลชุดนี้แทนผ่าน BMS tunnel (ระบบสำรอง)

## ติดตั้ง

### 1. ขอคีย์ (ผู้ดูแลระบบ NN-LRMS)

```bash
curl -X POST "https://kk-lrms.bmscloud.in.th/api/admin/hospitals/<hcode>/agent-key" \
  -H "Cookie: <session cookie ของผู้ดูแล>"
```

คีย์จะแสดงครั้งเดียว มีรูปแบบ `kklrms_...` — เก็บไว้แล้วปิดทิ้งห้ามส่งต่อ

โฟลเดอร์แพ็กเกจ (10 ไฟล์ในข้อ 2) ผู้ดูแลส่วนกลางสร้างด้วย `npm run agent:package`
(คู่มือฝั่งผู้ดูแลส่วนกลาง: [`BUILD.md`](BUILD.md))

### 2. ติดตั้งบนเครื่องห้องคลอด

ได้**โฟลเดอร์แพ็กเกจ**จากผู้ดูแลส่วนกลาง (10 ไฟล์) แล้ววางไว้ เช่น `C:\NN-LRMS-agent\`

```
nn-lrms-agent.exe            ตัว agent (ไฟล์เดี่ยว ไม่ต้องติดตั้งอะไรเพิ่ม)
NN-LRMS-agent-service.exe    WinSW (ตัวห่อให้เป็น service)
NN-LRMS-agent-service.xml    นิยาม service
agent.example.json           แม่แบบไฟล์ตั้งค่า
check.cmd                    ตรวจว่าเครื่องพร้อม
install-service.cmd           ติดตั้ง service
uninstall-service.cmd        ถอน service
INSTALL-GUIDE.html           คู่มือฉบับเต็ม
VERSION.txt / SHA256SUMS.txt เวอร์ชัน + checksum
```

สร้างไฟล์ตั้งค่า (แก้ 3 ค่า):

```
copy agent.example.json agent.config.json
   serverUrl         = https://kk-lrms.bmscloud.in.th
   apiKey            = คีย์จากข้อ 1
   gatewayToken      = <gateway token ของเครื่องนี้>   (ต้องมี — ใช้เรียก GetBMSSessionID)
   intervalMinutes   = 5
   localGateway      = http://127.0.0.1:45011
   marketplaceToken  = null (ถ้าใช้ local gateway ไม่ต้องใส่)
```

ทดสอบก่อน — รัน `nn-lrms-agent.exe` ตรง ๆ ต้องเห็น `cycle_done` ใน console
(หรือรัน `check.cmd` ซึ่งเช็คทั้งไฟล์ตั้งค่า, gateway, และเซิร์ฟเวอร์)

### 3. รันเป็น service (Windows + WinSW)

`nn-lrms-agent.exe` เป็นไฟล์เดียวจบ (มี runtime ฝังอยู่ข้างใน) — เครื่อง รพ. **ไม่ต้องติดตั้งอะไรเพิ่ม**

ติดตั้ง (คลิกขวา `install-service.cmd` → Run as administrator):

```powershell
# ทดสอบก่อนว่า agent เดินได้ (ดูว่าขึ้น "cycle_done")
.\nn-lrms-agent.exe

# ติดตั้งเป็น service (เริ่มอัตโนมัติตอนเปิดเครื่อง)
.\NN-LRMS-agent-service.exe install
.\NN-LRMS-agent-service.exe start

# ดูสถานะ / log
.\NN-LRMS-agent-service.exe status
Get-Content .\logs\NN-LRMS-agent-service.out.log -Tail 50
```

หยุด/ถอนการติดตั้ง:

```powershell
.\NN-LRMS-agent-service.exe stop
.\NN-LRMS-agent-service.exe uninstall
```

- service จะ restart เอง 2 ครั้งถ้าตัว agent ล้ม (30 วิ และ 60 วิ) แล้วหยุด ให้ IT รพ. ดู log
- log อยู่ที่ `logs\NN-LRMS-agent-service.out.log` (หมุนวง ดูได้ 8 ไฟล์)
- บัญชีที่ service ใช้คือ `NT AUTHORITY\LocalService` → ต้องให้สิทธิ์**อ่าน** `agent.config.json` และเข้าถึง `127.0.0.1:45011` ได้
  (ถ้าเครื่องเปิด HOSxP ด้วยสิทธิ์ผู้ใช้เฉพาะ ให้แก้ `<serviceaccount>` ใน XML เป็นบัญชีที่ใช้จริง)


**Linux (systemd)** — ดู `install/nn-lrms-agent.service` (ใช้ `agent.mjs` + Node 20)

## ตรวจว่าทำงานอยู่

- ดู console ของ agent: ต้องมีบรรทัด `cycle_done` ทุก 5 นาที
- ใน NN-LRMS: `/admin` → สถานะการซิงค์ → คอลัมน์ "เริ่มโดย" ต้องขึ้น `agent ที่ รพ.`
- ถ้าขึ้น `–` แปลว่า agent ยังไม่เคยส่งข้อมูล (ดู log ของ agent)

## เกิดข้อผิดพลาด

| อาการใน log | ทำอะไร |
|---|---|
| `local gateway ... ตอบ ... — HOSxP/BMS gateway ต้องเปิดอยู่` | HOSxP/BMS gateway บนเครื่องไม่ทำงาน หรือพอร์ตไม่ใช่ 45011 |
| `ไม่ได้ bms_session_id` | gateway ตอบแต่ไม่มี session — ดู `gateway_state` ใน log (ถ้าไม่ใช่ `running` ให้แก้ gateway) |
| `ต้องมี "gatewayToken"` | ยังไม่ได้ใส่ gateway token ใน `agent.config.json` |
| `PasteJSON` error | เครื่องนี้ต่ออินเทอร์เน็ตออกไม่ได้ หรือ session id หมดอายุ |
| `browser-push HTTP 401` | API key ผิด/ถูกยกเลิก → ขอคีย์ใหม่ |
| `permanently_blocked` | โรงพยาบาลถูกปิดใช้งาน หรือถูกลบข้อมูลแล้ว (purge) → ให้แอดมินตรวจ |

## ความปลอดภัย

- ไฟล์ `agent.config.json` มี API key + gateway token = ให้ถือเป็นรหัสผ่านของเครื่องนั้น
  (ปิดสิทธิ์อ่านไฟล์ให้เฉพาะบัญชีที่รัน agent)
- agent พิมพ์เฉพาะจำนวนและสถานะ ออก log **ไม่พิมพ์ชื่อผู้ป่วย/CID**
- ปิดคีย์ได้จากหน้า admin (ยกเลิก `webhook_api_keys` ของโรงพยาบาลนั้น)
