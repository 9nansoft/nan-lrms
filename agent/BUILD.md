# คู่มือ build agent (สำหรับผู้ดูแลส่วนกลาง)

คู่มือนี้สำหรับคนที่ **สร้าง** ไฟล์ agent เพื่อส่งให้โรงพยาบาล คู่มือ**ติดตั้งที่โรงพยาบาล**อยู่ใน
[`agent/README.md`](README.md)

## ต้องมีอะไร

| ของ | เวอร์ชัน | หมายเหตุ |
| --- | --- | --- |
| Node.js | 20 ขึ้นไป | ใช้รันเทสต์/เครื่องมือของโค้ดระบบ |
| bun | 1.4 ขึ้นไป | cross-compile เป็น `.exe` (ครั้งแรกจะดาวน์โหลด runtime ของ bun เอง) |
| npm | 10 ขึ้นไป | `npm ci` ในโค้ดระบบ |
| อินเทอร์เน็ต | ตอน build | ดาวน์โหลด bun runtime ครั้งแรก (เก็บใน cache ของ bun) |

## ส่ง รพ. = คำสั่งเดียว

```bash
npm run agent:package
```

ได้โฟลเดอร์ `dist/agent/nn-lrms-agent-<version>-win-x64/` (+ `.zip`) — **นี่คือของที่ส่งให้ รพ.**
ไม่ต้อง build แยก ไม่ต้องแก้ไฟล์ในโฟลเดอร์นั้น (คำสั่งเดียวจัดได้ทั้ง exe, WinSW, xml,
cmd helpers, คู่มือ, VERSION และ checksum)

## สร้างแพ็กเกจ

```bash
npm ci                       # ครั้งแรกเท่านั้น

# 1) วาง WinSW ไว้ครั้งเดียว (ไฟล์ exe ห้าม commit — gitignore ไว้แล้ว)
mkdir -p vendor/winsw
curl -L -o vendor/winsw/WinSW-x64.exe \
  https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe

# 2) build + แพ็ก
npm run agent:package
```

ผลลัพธ์: `dist/agent/nn-lrms-agent-<version>-win-x64/` (11 ไฟล์) + `.zip` ถ้าเครื่องมีคำสั่ง `zip`
พร้อม `SHA256SUMS.txt` ให้ รพ. ตรวจว่าไฟล์ตรงกับที่ส่ง

| ไฟล์ในแพ็กเกจ | มาจาก |
| --- | --- |
| `nn-lrms-agent.exe` | cross-compile ด้วย bun (runtime ฝังอยู่ในไฟล์ — 110 MB) |
| `NN-LRMS-agent-service.exe` | WinSW ที่วางไว้ (เปลี่ยนชื่อ) |
| `NN-LRMS-agent-service.xml` | `agent/package/NN-LRMS-agent-service.xml` |
| `agent.example.json` | `agent/package/agent.example.json` |
| `check.cmd` / `install-service.cmd` / `uninstall-service.cmd` | `agent/package/` |
| `INSTALL-GUIDE.html` | `docs/agent-install.html` |
| `VERSION.txt` / `SHA256SUMS.txt` | เขียนตอนแพ็ก |

## build แบบอื่น (ไม่ใช่ของส่ง รพ. — ใช้ตอนพัฒนาเท่านั้น)

```bash
npm run build:agent          # → agent/dist/agent.mjs  (Node 20+, ไม่มี dependency — ใช้ทดสอบบน Linux/macOS)
```

ผลลัพธ์ทั้งหมดถูก gitignore ไว้ (`dist/`, `vendor/winsw/`) — มาจากการ build เสมอ ไม่มีใคร commit ของ binary

## สิ่งที่ รพ. แก้เอง

`agent.config.json` — คัดลอกจาก `agent.example.json` แล้วใส่ `serverUrl` / `apiKey` / `gatewayToken`

## ทดสอบก่อนส่ง

```bash
cd agent
cp config.example.json agent.config.json      # ใส่ apiKey จริง + serverUrl
node dist/agent.mjs
```

ต้องเห็นใน console:

```json
{"msg":"agent_started","version":"1.0.0","serverUrl":"...","intervalMinutes":5}
{"msg":"cycle_done","mode":"local","pushed":true,"laborRead":2,"laborSent":2}
```

- `mode: "local"` = ดึงผ่าน local gateway บนเครื่องนั้น (ดีที่สุด) · `mode: "tunnel"` = ต่อผ่าน BMS tunnel
- `sessionExpiresAt` / `gatewayState` = เวลาหมดอายุของ session ที่ gateway ให้มา กับสถานะ gateway (`running` = ปกติ)
- `pushed: true` = ส่งข้อมูลเข้าเซิร์ฟเวอร์สำเร็จ
- ไม่มี `cycle_done` แต่มี `cycle_failed` → ดูข้อความ error (ปกติคือ local gateway ไม่ตอบ หรือ API key ผิด)

ทดสอบกับเซิร์ฟเวอร์จริงก่อนส่ง รพ. — คีย์ที่ใช้ทดสอบควรเป็นคีย์ของ รพ. ทดสอบ (hcode 00000) ไม่ใช่คีย์ของ รพ. จริง

## เวอร์ชัน

แก้ `agent/src/version.ts` (`AGENT_VERSION`) แล้ว build ใหม่ — เวอร์ชันจะไปโผล่ใน heartbeat ที่
เซิร์ฟเวอร์เก็บไว้ ดูได้จาก log ของ agent และจากหน้า admin (ถ้าต่อ UI heartbeat เสร็จ)

## แก้ปัญหา

| อาการ | ทำอะไร |
| --- | --- |
| `bun: command not found` | ต้องมี [bun](https://bun.sh) เพื่อ cross-compile (ครั้งแรกจะดาวน์โหลด runtime ของตัวเอง) |
| bun ดาวน์โหลด runtime ไม่ผ่าน | ต้องต่ออินเทอร์เน็ตตอน build ครั้งแรก |
| `.exe` รันแล้วไม่ขึ้น | ตรวจว่า `agent.config.json` อยู่ข้าง `agent.exe` และอ่านได้ (WinSW ใช้บัญชี `LocalService`) |
| agent ขึ้น `fetch failed` ทุกรอบ | ต้องต่อเน็ตออกจากเครื่องนั้นได้ (ไปหาเซิร์ฟเวอร์) และ local gateway ต้องเปิด |

## ส่งอย่างไร

ส่ง 4 ไฟล์ข้างบนให้ผู้ดูแล IT ของ รพ. (ไม่ผ่านแชทสาธารณะ — มี API key อยู่ในไฟล์ config)
คีย์ agent ขอจาก `POST /api/admin/hospitals/<hcode>/agent-key` (admin session) — คีย์แสดงครั้งเดียว
และมาพร้อม scope ครบ (`agent:push`, `agent:heartbeat`, `agent:authenticity`)
