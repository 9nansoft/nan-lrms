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

1. `GET http://127.0.0.1:45011/api/SessionID` — เอา session id สดจาก BMS gateway ในเครื่อง
   (ชิ้นที่เซิร์ฟเวอร์กลางทำเองไม่ได้ เพราะ `/api/SessionID` มีแค่บน local gateway)
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

### 2. ติดตั้งบนเครื่องห้องคลอด

Windows: ใช้ `agent.exe` (ไฟล์เดียว ไม่ต้องติดตั้งอะไร) — ดูข้อ 3
Linux/macOS หรืออยากดีบักด้วย Node: ต้องมี Node.js 20 ขึ้นไป (https://nodejs.org)

```bash
# 1) ได้ไฟล์ agent.mjs จากผู้ดูแลส่วนกลาง (ไฟล์เดียว ไม่มี dependency) แล้ววางที่
#    C:\NN-LRMS-agent\agent.mjs  (หรือ /opt/nn-lrms-agent/agent.mjs บน Linux)
#    — ไฟล์นี้ได้จาก `npm run build:agent` ในโค้ดระบบ (ได้ agent/dist/agent.mjs)

# 2) สร้างไฟล์ตั้งค่า
cp agent.config.example.json agent.config.json
#    แก้ agent.config.json:
#      serverUrl         = https://kk-lrms.bmscloud.in.th
#      apiKey            = คีย์จากข้อ 1
#      intervalMinutes   = 5
#      localGateway      = http://127.0.0.1:45011
#      marketplaceToken  = null (ถ้าใช้ local gateway ไม่ต้องใส่)

# 3) ทดสอบก่อน — ต้องเห็น "cycle_done" ใน console
node agent.mjs
```

**ถ้าต้องใส่ marketplace token** (ต้องใช้เมื่อ local gateway ใช้ไม่ได้ แล้ว agent ต้องต่อผ่าน BMS tunnel
— HOSxP จะสุ่ม CID/HN ให้ถ้าไม่มี token): เปิด NN-LRMS จากเมนูใน HOSxP ในเบราว์เซอร์ แล้วดู
DevTools → Application → Local Storage → คีย์ `marketplace_token` แล้วคัดลอกค่ามาใส่ในไฟล์ตั้งค่า
(ค่านี้ผูกกับโรงพยาบาลนั้น ให้ถือเป็นความลับเหมือนกัน)

### 3. รันเป็น service (Windows + WinSW)

`agent.exe` เป็นไฟล์เดียวจบ (มี Node runtime ฝังอยู่ข้างใน) — เครื่อง รพ. **ไม่ต้องติดตั้ง Node.js**

ไฟล์ที่ต้องมีในโฟลเดอร์เดียวกัน เช่น `C:\NN-LRMS-agent\`

| ไฟล์ | ที่มา |
| --- | --- |
| `agent.exe` | ไฟล์เดียว 37 MB — ส่งจากผู้ดูแลส่วนกลาง (สร้างจาก `npm run build:agent:win`) |
| `NN-LRMS-agent.exe` | WinSW (ดาวน์โหลด `winsw-x64.exe` จาก GitHub releases แล้วเปลี่ยนชื่อ) |
| `NN-LRMS-agent.xml` | ไฟล์นี้ (`agent/install/NN-LRMS-agent.xml`) |
| `agent.config.json` | ไฟล์ตั้งค่าจากข้อ 2 |

ติดตั้ง (เปิด PowerShell แบบ Administrator ในโฟลเดอร์นั้น):

```powershell
# ทดสอบก่อนว่า agent เดินได้ (ดูว่าขึ้น "cycle_done")
.\agent.exe

# ติดตั้งเป็น service (เริ่มอัตโนมัติตอนเปิดเครื่อง)
.\NN-LRMS-agent.exe install
.\NN-LRMS-agent.exe start

# ดูสถานะ / log
.\NN-LRMS-agent.exe status
Get-Content .\logs\NN-LRMS-agent.out.log -Tail 50
```

หยุด/ถอนการติดตั้ง:

```powershell
.\NN-LRMS-agent.exe stop
.\NN-LRMS-agent.exe uninstall
```

- service จะ restart เอง 2 ครั้งถ้าตัว agent ล้ม (30 วิ และ 60 วิ) แล้วหยุด ให้ IT รพ. ดู log
- log อยู่ที่ `logs\NN-LRMS-agent.out.log` (หมุนวง ดูได้ 8 ไฟล์)
- บัญชีที่ service ใช้คือ `NT AUTHORITY\LocalService` → ต้องให้สิทธิ์**อ่าน** `agent.config.json` และเข้าถึง `127.0.0.1:45011` ได้
  (ถ้าเครื่องเปิด HOSxP ด้วยสิทธิ์ผู้ใช้เฉพาะ ให้เปลี่ยน `<serviceaccount>` ใน XML เป็นบัญชีที่ใช้จริง)

**Linux (systemd)** — ดู `install/nn-lrms-agent.service` (ใช้ `agent.mjs` + Node 20)

## ตรวจว่าทำงานอยู่

- ดู console ของ agent: ต้องมีบรรทัด `cycle_done` ทุก 5 นาที
- ใน NN-LRMS: `/admin` → สถานะการซิงค์ → คอลัมน์ "เริ่มโดย" ต้องขึ้น `agent ที่ รพ.`
- ถ้าขึ้น `–` แปลว่า agent ยังไม่เคยส่งข้อมูล (ดู log ของ agent)

## เกิดข้อผิดพลาด

| อาการใน log | ทำอะไร |
|---|---|
| `local gateway ... ตอบ ... — HOSxP/BMS gateway ต้องเปิดอยู่` | HOSxP/BMS gateway บนเครื่องไม่ทำงาน หรือพอร์ตไม่ใช่ 45011 |
| `PasteJSON` error | เครื่องนี้ต่ออินเทอร์เน็ตออกไม่ได้ หรือ session id หมดอายุ |
| `browser-push HTTP 401` | API key ผิด/ถูกยกเลิก → ขอคีย์ใหม่ |
| `permanently_blocked` | โรงพยาบาลถูกปิดใช้งาน หรือถูกลบข้อมูลแล้ว (purge) → ให้แอดมินตรวจ |

## ความปลอดภัย

- ไฟล์ `agent.config.json` มี API key = ให้ถือเป็นรหัสผ่านของเครื่องนั้น
  (ปิดสิทธิ์อ่านไฟล์ให้เฉพาะบัญชีที่รัน agent)
- agent พิมพ์เฉพาะจำนวนและสถานะ ออก log **ไม่พิมพ์ชื่อผู้ป่วย/CID**
- ปิดคีย์ได้จากหน้า admin (ยกเลิก `webhook_api_keys` ของโรงพยาบาลนั้น)
