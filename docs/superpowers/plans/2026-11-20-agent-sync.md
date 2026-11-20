# 2026-11-20 — ซิงค์ HOSxP โดยไม่ต้องเปิด browser (agent + server backstop)

## Context

ปัจจุบันข้อมูล HOSxP เข้าแคชกลางได้ทางเดียว: **browser tab** ที่ล็อกอินด้วย BMS session
(`src/lib/browser-poll.ts` → `POST /api/sync/browser-push`) หรือ **webhook** ที่ HOSxP ยิงเข้ามา
(`/api/webhooks/patient-data`). ถ้าไม่มี tab เปิด → ไม่มีข้อมูลสด

`README.md:74-83`, `:353` ระบุชัดว่า "ไม่มี scheduled polling จาก HOSxP ฝั่ง server" และ
"ถ้าไม่มี browser tab และไม่มี Webhook sender ระบบจะไม่มีแหล่งดึง HOSxP ตามเวลาเอง"

เหตุที่ server-side polling ถูกปิด (`962f342`, 2026-05-08): "the BMS tunnel rate-limits at
15 calls/sec/hospital and the server-side scheduler couldn't keep up with the per-cycle query
volume across all 26 hospitals" — และข้อจำกัดเชิงโครงสร้างที่ยังอยู่:

> "The server cannot mint a HOSxP session on its own: the tunnel's /api/SessionID belongs to the
> LOCAL gateway on the ward's workstation and a public tunnel answers 'Access Denied'. The only
> entity that holds a live session id is the hospital's own browser"
> — `src/services/sync/maternity-assessment.ts:600-606`, `src/lib/bms-session.ts:71-73`

### ข้อสังเกตจากการ debug รพ.น่าน (2026-11-20)

- dashboard "ห้องคลอด" ของ รพ.น่าน = 0 ขณะที่หน้าห้องคลอดมี 2 ราย
- สาเหตุ: ทั้ง 2 รายบันทึก `ipt_admit_type_id = 1` (ทั่วไป) ไม่ใช่ `3` (คลอดบุตร)
  ที่ `SQL_ACTIVE_LABOUR` กรอง (`src/lib/browser-poll.ts:285`) → ไม่มีแถวไหนถูกดึง → แคชว่าง
- เผยให้เห็นว่า **"ไม่มีข้อมูลในแคช" อาจเป็นเพราะไม่มีใครดึง** ไม่ใช่เพราะ permission
  → ต้องมี "แหล่งดึงที่ไม่พึ่ง browser" และต้องบอกได้ว่า **ข้อมูลหายเพราะอะไร**

## เป้าหมาย (จากผู้ใช้)

| ข้อ | คำตอบ |
|---|---|
| ตัวดึงข้อมูลอยู่ไหน | agent ที่ รพ. (หลัก) + server-side (สำรอง) |
| ติดตั้งที่ รพช. ได้ไหม | ได้ มี PC เปิด 24 ชม. |
| latency ที่ยอมรับ | ≤ 15 นาที |

## สถาปัตยกรรม 3 ชั้น

```
ชั้น 1 (เร็วสุด, ถ้ามี tab):  browser tab ──pull ผ่าน local gateway 127.0.0.1:45011──▶ /api/sync/browser-push   [เดิม]
ชั้น 2 (หลัก, ไม่ต้องมีคน):  agent ที่ รพ. ──pull ผ่าน local gateway 127.0.0.1:45011──▶ /api/sync/agent-push     [ใหม่]
ชั้น 3 (สำรอง):             server ──poll ผ่าน BMS tunnel (JWT ที่เก็บไว้)──────────▶ cached_*                [polling.ts เดิม]
```

**ชั้น 2 — agent ที่ รพ.** เป็นตัวโปรแกรม Node เล็กๆ ที่ติดตั้งบนเครื่องเดียวกับ HOSxP
(เครื่องที่มี BMS gateway `127.0.0.1:45011` อยู่แล้ว) ทำงานเป็น service 24 ชม.

1. `GET http://127.0.0.1:45011/api/SessionID` → session id สด (ชิ้นที่ server ทำไม่ได้)
2. `GET https://hosxp.net/phapi/PasteJSON?Action=GET&code=<sid>` → bearer + tunnel URL
3. pull ชุดเดียวกับ browser (`SQL_ACTIVE_LABOUR`, partograph, ANC, ANC labs, newborn, referral)
   ผ่าน local gateway → ไม่โดน rate limit ของ tunnel, ได้ข้อมูลจริง (ไม่ถูก randomize)
4. push เข้าแอปด้วย `Authorization: Bearer <api key>` → `POST /api/sync/agent-push`
   (payload shape เดียวกับ browser-push, process service เดียวกัน)
5. รายงาน heartbeat (agent version, เวลาที่ pull ล่าสุด, ok/error) เก็บใน Redis

**ชั้น 3 — server backstop** ใช้ `pollHospital` เดิม (`src/services/sync/polling.ts:813`)
ทุก 15 นาที เฉพาะ รพ. ที่ heartbeat ของ agent เก่ากว่า 20 นาที (หรือไม่มี agent)
— โหลดต่ำมาก (26 รพ. × ~6 query / 15 นาที) จึงไม่ชนข้อจำกัด 15 req/s ที่ทำให้ปิด scheduler เดิม
JWT ต่อได้เพราะ agent ส่ง `bms_session_id` สดมาทุกรอบ (server มี logic refresh อยู่แล้วที่
`src/services/sync/maternity-assessment.ts:645-712`)

## สิ่งที่ต้องทำ

### A. รีแฟกเตอร์เพื่อ reuse (constitution §III DRY, §IV)

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/services/sync/push-sections.ts` (ใหม่) | ย้าย block validate→process→appendSyncStep ของแต่ละ section ออกจาก `src/app/api/sync/browser-push/route.ts` ให้เป็นฟังก์ชันเดียว ใช้ร่วมกับ agent-push |
| `src/config/hosxp-active-labor.ts` (ใหม่) | canonical SQL ของ active labour + partograph (MySQL/PostgreSQL) — ปัจจุบันซ้ำ 2 ชุดและ drift แล้ว (`src/config/hosxp-queries.ts:20` vs `src/lib/browser-poll.ts:254`, drift บันทึกไว้ที่ `hosxp-queries.ts:55-61`) |
| `src/lib/browser-poll.ts` | แยก `runPollCycle` ให้ฉีด transport (pull/push) เพื่อให้ browser กับ agent ใช้ logic เดียวกัน |

### B. agent (`agent/` ใหม่)

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `agent/src/index.ts` | loop: ทุก N นาที pull → push; อ่าน `agent.config.json` |
| `agent/src/session.ts` | เอา session id จาก local gateway → PasteJSON → bearer/tunnel; fallback เป็น tunnel mode |
| `agent/src/pull.ts` | เรียก pull logic ที่แยกออกจาก `browser-poll.ts` |
| `agent/src/push.ts` | POST `/api/sync/agent-push` พร้อม `Authorization: Bearer <api key>` |
| `agent/probe.mjs` | probe เดี่ยวๆ สำหรับเครื่อง รพ. — พิสูจน์ว่า session/ข้อมูลดึงได้จริงก่อนเขียน agent เต็ม |
| `agent/install/` | ตัวติดตั้ง (Windows Task Scheduler / systemd) + `agent/README.md` ภาษาไทยสำหรับ รพ. |

### C. ฝั่งแอป

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/app/api/sync/agent-push/route.ts` (ใหม่) | auth ด้วย API key (`validateApiKey` → `src/services/webhook.ts:542`), hospital มาจาก key ไม่มาจาก body, เช็ค `is_active` + purge guard, `startSyncRun(trigger='agent')`, เรียก section processor ชุดเดียวกับ browser, บันทึก heartbeat, refresh server JWT จาก `bms_session_id` |
| `src/services/sync/progress-store.ts:30` | เพิ่ม `'agent'` ใน `SyncRunTrigger` |
| `src/config/sync-run-status.ts:10,24` | เพิ่ม label ไทยของ trigger `agent` |
| `src/components/admin/SyncOverviewTab.tsx:48`, `src/components/admin/HospitalEditDialog.tsx:1609` | เพิ่ม `'agent'` ใน type ที่ประกาศเอง |
| `scripts/mint-agent-key.mjs` (ใหม่) | CLI สำหรับ admin: mint API key ผูกกับ รพ. (พิมพ์ raw key ครั้งเดียว) |
| `src/services/sync/agent-backstop.ts` (ใหม่) | scheduler 15 นาที: เรียก `pollHospital` เฉพาะ รพ. ที่ heartbeat เก่า/ไม่มี |
| `src/app/api/admin/sync-overview/route.ts` | ส่ง heartbeat/สถานะ agent ไปให้หน้า admin |

### D. เหตุผลของ "ไม่มีข้อมูล" (ปิดช่องโหว่เดิม)

- หน้า รพ. (hospital detail) + แดชบอร์ดต้องบอกเหตุผลเมื่อ count = 0: "ยังไม่มีใครดึงข้อมูล"
  (agent ไม่ติดตั้ง/หยุด), "ซิงค์ล่าสุดเมื่อ …", "admit type ไม่ใช่คลอดบุตร" (เคสนี้วันนี้)
- ย้ายตัวกรอง admit type ออกจาก query (คงไว้ใน config ต่อ รพ. ตามที่คุยกันเมื่อวาน)

### E. เอกสาร

- `README.md:63-83`, `:353` — อัปเดตสถาปัตยกรรม sync (เพิ่มชั้น agent + backstop)
- `public/manual.html` — คู่มือ รพ. (ติดตั้ง agent, การแก้เมื่อไม่มีข้อมูล)
- `.specify/memory/constitution.md:138-139` — บรรทัด "Server-side polling … is the primary data
  ingestion mechanism" ไม่ตรงความจริงแล้ว → แก้ตามขั้นตอน amendment ของ constitution

## การทดสอบ (constitution §II TDD)

1. unit: canonical labour SQL เดียวกันถูกใช้ทั้ง browser/agent/server (กัน drift)
2. integration: `POST /api/sync/agent-push` → เขียน `cached_patients` + `maternal_journeys`,
   trigger = 'agent', heartbeat ถูกบันทึก, key ของ รพ. อื่นถูกปฏิเสธ, purge → 403
3. integration: backstop ไม่ยิงซ้ำเมื่อ agent heartbeat สด
4. e2e: agent push แล้ว → ตัวเลขแดชบอร์ดเปลี่ยน
5. probe จริงที่ รพ.น่าน: `agent/probe.mjs` ยืนยัน session acquisition

## ความเสี่ยง

| ความเสี่ยง | การจัดการ |
|---|---|
| local gateway ไม่ให้ session id แบบ headless | `agent/probe.mjs` ทดสอบก่อน; fallback: อ่าน HOSxP MySQL ตรง (ต้องขอ creds จาก รพ.) หรือ tunnel mode |
| local gateway ต้องใช้ marketplace token | agent เก็บ token ใน config (เป็นของ รพ. นั้นเอง) ตอนติดตั้ง |
| API key หลุดจากเครื่อง รพ. | เก็บในไฟล์ config สิทธิ์เฉพาะผู้ใช้, revoke ได้จาก admin (`webhook_api_keys.revoked_at`) |
| โหลดต่อ HOSxP | agent ทุก 5 นาที + local gateway (ไม่ใช่ tunnel) → ไม่กินโควตา 15 req/s ของ tunnel |
| ซ้ำซ้อนข้อมูลระหว่าง 3 ชั้น | upsert ทุกชั้น idempotent (`upsertCachedPatients`), และทุกชั้นเขียน `updated_at` |


## สถานะการทำงาน (2026-11-20)

### เสร็จแล้ว

| ส่วน | ไฟล์ |
| --- | --- |
| push handler รวม (browser + agent ใช้ตัวเดียวกัน) | `src/services/sync/push-handler.ts` (ย้ายจาก `browser-push/route.ts`) |
| actor resolution (session / API key) + purge + is_active gate | `src/services/sync/push-auth.ts` |
| route ของ agent | `src/app/api/sync/agent-push/route.ts` |
| heartbeat | `src/services/sync/agent-heartbeat.ts`, `src/app/api/sync/agent-heartbeat/route.ts` |
| backstop ฝั่ง server (15 นาที, เฉพาะ รพ. ที่ agent เงียบ) | `src/services/sync/agent-backstop.ts`, ต่อใน `src/app/api/startup.ts` |
| refresh session ฝั่ง server จาก `bms_session_id` ที่ push มา | `src/services/sync/push-handler.ts` → `serverBmsSession` |
| โปรแกรม agent (ดึงจาก local gateway, push ทุก 5 นาที) | `agent/src/*`, `agent/build.mjs`, `agent/dist/agent.mjs`, `agent/README.md` |
| agent เป็น .exe เดียว + service Windows (WinSW) | `agent/build-windows.mjs` (esbuild → pkg, `node18-win-x64`), `agent/install/NN-LRMS-agent.xml` |
| probe สำหรับเครื่อง รพ. | `agent/probe.ps1` |
| ออกคีย์ agent (admin) | `src/app/api/admin/hospitals/[hcode]/agent-key/route.ts` |
| trigger 'agent' ใน Sync Log | `src/services/sync/progress-store.ts`, `src/config/sync-run-status.ts`, UI 2 ไฟล์ |
| แก้ bug payload ของ `webhook_setting` (คอลัมน์ผิด + NOT NULL) | `src/hooks/useOnboardHosxpWebhook.ts` (`webhookSettingPayload`) |
| เอกสาร | `README.md`, `public/manual.html`, `agent/README.md` |
| เทสต์ | `tests/unit/api/agent-push.test.ts` (8), `tests/unit/api/agent-heartbeat.test.ts` (5), `tests/unit/hooks/use-onboard-hosxp-webhook.test.ts` (1) |

### ไฟล์ที่ รพ. ได้รับ (3 ไฟล์)

- `agent.exe` — ไฟล์เดียว 37 MB (มี Node 18 runtime ฝังอยู่) ไม่ต้องติดตั้งอะไรที่เครื่อง รพ.
- `NN-LRMS-agent.exe` — WinSW (ดาวน์โหลด `winsw-x64.exe` จาก GitHub releases แล้วเปลี่ยนชื่อ)
- `NN-LRMS-agent.xml` — นิยาม service (จาก `agent/install/NN-LRMS-agent.xml`)

ติดตั้งเป็น service: `NN-LRMS-agent.exe install` + `start` (ดู `agent/README.md`)

### ยังไม่ทำ (ค่อยทำต่อ)

1. **ปุ่มออกคีย์ agent ในหน้า /admin** — มี API แล้ว (`POST /api/admin/hospitals/<hcode>/agent-key`) แต่ยังต้องเรียกด้วย curl
2. **ปุ่ม/สถานะ agent ในหน้า Sync Status** — heartbeat ถูกเก็บแล้ว แต่ยังไม่แสดงในตาราง admin
3. **อธิบายว่า "ไม่มีข้อมูล" ในหน้า รพ.** — ยังไม่บอกในแอปว่าเลข 0 เพราะไม่มีใครดึง / admit type ผิด
4. **admit type ต่อ รพ. (config)** — ผู้ใช้เลือก "แก้ที่ HOSxP" แทน (เคสนี้ยังไม่แก้ในโค้ด)
5. **คอลัมน์ admit type ต่อ รพ. ที่ รพ.น่าน** — ยังไม่ได้แก้ข้อมูลใน HOSxP (ต้องให้ รพ.น่านแก้เอง)

### ข้อค้นพบระหว่างสำรวจ (ยังไม่แก้)

- `docs/hosxp/KKLRMSWebhookUnit.pas` อ่าน `webhook_setting_code = "KK-LRMS"` แต่แอปเขียน `'NN-LRMS'` → sender ฝั่ง HOSxP จะไม่เจอแถวของเรา
- ที่ รพ.น่าน มีแถว `webhook_setting` code `NN-LRMS` อยู่แล้ว แต่ URL ชี้ไป `https://lrms.nanhospital.go.th/` (OneLR ของ รพ. เอง)
  → hook ของแอปจะ "เห็นว่ามีแล้ว" แล้วข้าม ทำให้ HOSxP ไม่ยิงเข้าแอปเรา (และถ้าแก้ payload ให้ UPDATE สำเร็จ จะไปทับของ OneLR ได้ — ต้องตัดสินใจกับ รพ.น่านก่อน)
- ฟังก์ชันส่ง labour/partograph/referral ใน Pascal unit ไม่มี call site เลย (มีแต่ส่ง ANC ตอนกดบันทึก)
