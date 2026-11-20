# คู่มือ build agent (สำหรับผู้ดูแลส่วนกลาง)

คู่มือนี้สำหรับคนที่ **สร้าง** ไฟล์ agent เพื่อส่งให้โรงพยาบาล คู่มือ**ติดตั้งที่โรงพยาบาล**อยู่ใน
[`agent/README.md`](README.md)

## ต้องมีอะไร

| ของ | เวอร์ชัน | หมายเหตุ |
| --- | --- | --- |
| Node.js | 20 ขึ้นไป | ใช้ build + ทดสอบ |
| npm | 10 ขึ้นไป | `npm i` ในโค้ดระบบ (มี `pkg` เป็น devDependency แล้ว) |
| อินเทอร์เน็ต | ตอน build `.exe` | `pkg` ดาวน์โหลด Node runtime ครั้งแรก (เก็บใน cache) |

## สร้างไฟล์

```bash
npm ci                       # ครั้งแรกเท่านั้น
npm run build:agent          # → agent/dist/agent.mjs   (Node 20+, ไม่มี dependency)
npm run build:agent:win      # → agent/dist/agent.exe   (Windows x64, 37 MB, ไม่ต้องมี Node ในเครื่อง รพ.)
```

- `agent.mjs` — ใช้ตอนทดสอบบน Linux/macOS หรือบนเครื่องที่มี Node อยู่แล้ว
- `agent.exe` — ของจริงที่ส่งให้ รพ. (Node runtime ฝังอยู่ในไฟล์)

ทั้งสองไฟล์ถูก gitignore ไว้ (`dist/`) — ผลลัพธ์มาจากการ build เสมอ ไม่มีใคร commit ของ binary

## สิ่งที่ต้องส่งให้โรงพยาบาล (3 ไฟล์ + config)

| ไฟล์ | ที่มา |
| --- | --- |
| `agent.exe` | `agent/dist/agent.exe` จาก `npm run build:agent:win` |
| `NN-LRMS-agent.exe` | WinSW — ดาวน์โหลด `winsw-x64.exe` จาก GitHub releases แล้วเปลี่ยนชื่อเป็น `NN-LRMS-agent.exe` |
| `NN-LRMS-agent.xml` | `agent/install/NN-LRMS-agent.xml` (นิยาม service) |
| `agent.config.json` | `agent/config.example.json` + แก้ `serverUrl` / `apiKey` / `intervalMinutes` |

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
- `pushed: true` = ส่งข้อมูลเข้าเซิร์ฟเวอร์สำเร็จ
- ไม่มี `cycle_done` แต่มี `cycle_failed` → ดูข้อความ error (ปกติคือ local gateway ไม่ตอบ หรือ API key ผิด)

ทดสอบกับเซิร์ฟเวอร์จริงก่อนส่ง รพ. — คีย์ที่ใช้ทดสอบควรเป็นคีย์ของ รพ. ทดสอบ (hcode 00000) ไม่ใช่คีย์ของ รพ. จริง

## เวอร์ชัน

แก้ `agent/src/version.ts` (`AGENT_VERSION`) แล้ว build ใหม่ — เวอร์ชันจะไปโผล่ใน heartbeat ที่
เซิร์ฟเวอร์เก็บไว้ ดูได้จาก log ของ agent และจากหน้า admin (ถ้าต่อ UI heartbeat เสร็จ)

## แก้ปัญหา

| อาการ | ทำอะไร |
| --- | --- |
| `Error! No available node version satisfies 'node20'` | `pkg` 5.8.1 มี runtime แค่ถึง node18 — ใช้ `--target node18-win-x64` (ค่าเริ่มต้นใน `build-windows.mjs` แล้ว) |
| `pkg` ดาวน์โหลดไม่ผ่าน | ต้องต่ออินเทอร์เน็ตตอน build ครั้งแรก หรือใช้ `PKG_CACHE_PATH` เพื่อ cache ไว้ |
| `.exe` รันแล้วไม่ขึ้น | ตรวจว่า `agent.config.json` อยู่ข้าง `agent.exe` และอ่านได้ (WinSW ใช้บัญชี `LocalService`) |
| agent ขึ้น `fetch failed` ทุกรอบ | ต้องต่อเน็ตออกจากเครื่องนั้นได้ (ไปหาเซิร์ฟเวอร์) และ local gateway ต้องเปิด |

## ส่งอย่างไร

ส่ง 4 ไฟล์ข้างบนให้ผู้ดูแล IT ของ รพ. (ไม่ผ่านแชทสาธารณะ — มี API key อยู่ในไฟล์ config)
คีย์ agent ขอจาก `POST /api/admin/hospitals/<hcode>/agent-key` (admin session) — คีย์แสดงครั้งเดียว
และมาพร้อม scope ครบ (`agent:push`, `agent:heartbeat`, `agent:authenticity`)
