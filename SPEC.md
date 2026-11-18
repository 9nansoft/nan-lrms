# Application Specification
## KK-LRMS — Khon Kaen Labor Room Monitoring System
### ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดขอนแก่น

| รายการ | รายละเอียด |
|--------|-----------|
| Version | 1.0 |
| Platform | KK-LRMS (Web-based) |
| Data Source | HOSxP HIS / BMS Central API |
| พื้นที่ | จังหวัดขอนแก่น (เขตสุขภาพที่ 7) |
| วันที่จัดทำ | มีนาคม 2569 |
| สถานะ | Draft |

---

## สารบัญ

1. [บทนำ (Introduction)](#1-บทนำ-introduction)
2. [สถาปัตยกรรมระบบ (System Architecture)](#2-สถาปัตยกรรมระบบ-system-architecture)
3. [การเชื่อมต่อข้อมูล HOSxP / API กลาง](#3-การเชื่อมต่อข้อมูล-hosxp--api-กลาง)
4. [ความต้องการเชิงฟังก์ชัน (Functional Requirements)](#4-ความต้องการเชิงฟังก์ชัน-functional-requirements)
5. [ความต้องการด้านอื่น ๆ (Non-Functional Requirements)](#5-ความต้องการด้านอื่น-ๆ-non-functional-requirements)
6. [Data Flow และ Workflow](#6-data-flow-และ-workflow)
7. [รายการหน้าจอ (UI Screens)](#7-รายการหน้าจอ-ui-screens)
8. [คำศัพท์ (Glossary)](#8-คำศัพท์-glossary)

---

## 1. บทนำ (Introduction)

### 1.1 ภาพรวมโครงการ (Project Overview)

**KK-LRMS (Khon Kaen Labor Room Monitoring System)** คือระบบติดตามการคลอดแบบรวมศูนย์ระดับจังหวัด สำหรับจังหวัดขอนแก่น พัฒนาขึ้นเพื่อให้สูติแพทย์และพยาบาลห้องคลอดของโรงพยาบาลแม่ข่าย (รพ.ขอนแก่น, รพ.ศรีนครินทร์) สามารถ Monitor ผู้คลอดที่รอคลอดในโรงพยาบาลชุมชน (รพช.) ทั่วจังหวัดขอนแก่นได้แบบ Real-time

ระบบดึงข้อมูลจาก **HOSxP HIS** ที่ใช้งานอยู่ใน รพช. ทุกแห่ง ผ่าน **BMS Central API** เพื่อรวบรวมข้อมูลผู้คลอดมาแสดงบน Dashboard กลางของ KK-LRMS โดยไม่ต้องให้เจ้าหน้าที่บันทึกข้อมูลซ้ำ

### 1.2 วัตถุประสงค์ (Objectives)

1. เพิ่มความปลอดภัยในการคลอดโดยการติดตามความเสี่ยง CPD (Cephalopelvic Disproportion) แบบ Real-time
2. สร้างมาตรฐานการส่งต่อผู้ป่วยตาม MOU เขตสุขภาพที่ 7
3. ลดอัตราการเสียชีวิตและภาวะแทรกซ้อนจากการคลอด
5. **ลดภาระการบันทึกข้อมูลซ้ำ** โดยดึงข้อมูลอัตโนมัติจาก HOSxP

### 1.3 กลุ่มผู้ใช้งาน (Target Users)

| บทบาท | ตำแหน่ง | การใช้งานหลัก |
|-------|---------|--------------|
| สูติแพทย์ | แพทย์เฉพาะทางสูติศาสตร์ รพ.ขอนแก่น / รพ.ศรีนครินทร์ | Monitor Case, ให้คำแนะนำส่งต่อ, ประเมินความเสี่ยง |
| พยาบาลห้องคลอด | พยาบาลวิชาชีพประจำห้องคลอด รพ.แม่ข่าย | ติดตาม Partogram, รับแจ้งเตือน, ประสานงานส่งต่อ |
| พยาบาล รพช. | พยาบาลวิชาชีพ รพช. ในจังหวัดขอนแก่น | บันทึกข้อมูลผู้คลอดใน HOSxP, อัปเดตสถานะ |
| ผู้ดูแลระบบ | IT Admin | จัดการ API Key, ตั้งค่าการเชื่อมต่อ HOSxP, ดูแล Server |

### 1.4 สถาปัตยกรรมเครือข่าย (Network Architecture)

ระบบ KK-LRMS ใช้โมเดล Hub-and-Spoke โดยมี รพ.ขอนแก่น เป็นศูนย์กลาง เชื่อมต่อกับ รพช. ในจังหวัดขอนแก่นทุกระดับ:

- **รพ.ขอนแก่น** — โรงพยาบาลศูนย์ (ศูนย์กลาง KK-LRMS)
- **รพช. A (S)** — โรงพยาบาลชุมชนขนาดใหญ่ (เช่น รพ.ชุมแพ, รพ.พล, รพ.บ้านไผ่, รพ.น้ำพอง)
- **รพช. M1** — โรงพยาบาลชุมชนขนาดกลาง
- **รพช. M2** — โรงพยาบาลชุมชนขนาดกลาง-เล็ก
- **รพช. F1** — โรงพยาบาลชุมชนขนาดเล็กระดับ 1
- **รพช. F2** — โรงพยาบาลชุมชนขนาดเล็กระดับ 2
- **รพช. F3** — โรงพยาบาลชุมชนขนาดเล็กระดับ 3 / รพ.สต.

ข้อมูลไหลจาก HOSxP ผ่าน BMS Central API มายัง KK-LRMS

---

## 2. สถาปัตยกรรมระบบ (System Architecture)

### 2.1 ภาพรวมสถาปัตยกรรม

```
┌──────────────────────────────────────────────────────────────────┐
│                    KK-LRMS Web Application                       │
│           (Khon Kaen Labor Room Monitoring System)                │
│                                                                   │
│  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Dashboard │  │ Partogram  │  │ CPD Risk │  │ Notification │  │
│  │  Module   │  │  Module    │  │  Module  │  │   Module     │  │
│  └─────┬─────┘  └─────┬──────┘  └────┬─────┘  └──────┬───────┘  │
│        └──────────┬────┴──────────────┴───────────────┘           │
│                   │                                               │
│          ┌────────▼────────┐                                      │
│          │   KK-LRMS API   │                                      │
│          │   (Backend)     │                                      │
│          └────────┬────────┘                                      │
└───────────────────┼──────────────────────────────────────────────┘
                    │
          ┌─────────▼─────────┐
          │  BMS Central API  │──────── Authentication (JWT/API Key)
          │  (Data Gateway)   │
          └─────────┬─────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼───┐     ┌────▼────┐    ┌────▼────┐
│HOSxP  │     │ HOSxP   │    │ HOSxP   │    ...  (รพช. ทุกแห่ง
│รพ.ชุมแพ│     │รพ.น้ำพอง │    │รพ.บ้านไผ่│         ในจังหวัดขอนแก่น)
└───────┘     └─────────┘    └─────────┘
```

### 2.2 Technology Stack

| Layer | เทคโนโลยี | หมายเหตุ |
|-------|----------|---------|
| Frontend | Web Application (SPA) | รองรับ Desktop, Tablet |
| Backend API | KK-LRMS REST API | จัดการ Business Logic, CPD Calculation |
| Data Gateway | BMS Central API (Session API) | ดึงข้อมูลจาก HOSxP ทุก รพช. |
| Source Database | HOSxP MySQL | ฐานข้อมูล HIS ของแต่ละ รพช. |
| Authentication | JWT Token (BMS Session API) | ยืนยันตัวตนระหว่างระบบ |

---

## 3. การเชื่อมต่อข้อมูล HOSxP / API กลาง

### 3.1 ภาพรวมการเชื่อมต่อ

KK-LRMS ไม่ได้เก็บข้อมูลผู้ป่วยด้วยตัวเอง แต่ดึงข้อมูลจาก HOSxP ของ รพช. แต่ละแห่ง ผ่าน **BMS Central API** ซึ่งทำหน้าที่เป็น Data Gateway กลาง

```
KK-LRMS  ──(REST API)──▶  BMS Central API  ──(DB Connection)──▶  HOSxP MySQL
                          (Session API + JWT)
```

### 3.2 BMS Central API (Session API)

#### 3.2.1 Authentication

การเข้าถึง BMS Central API ใช้ **BMS Session API** พร้อม JWT Token:

```
POST /api/v1/auth/session
Authorization: Bearer <JWT_TOKEN>
X-Hospital-Code: <HCODE>

Response:
{
  "session_id": "...",
  "token": "...",
  "hospital": { "hcode": "10670", "name": "รพ.ชุมแพ" },
  "expires_at": "2026-03-08T12:00:00Z"
}
```

#### 3.2.2 API Endpoints สำหรับดึงข้อมูลผู้คลอด

| Endpoint | Method | คำอธิบาย |
|----------|--------|---------|
| `/api/v1/labor/patients` | GET | ดึงรายชื่อผู้คลอดที่กำลังรอคลอด (Active Labor) |
| `/api/v1/labor/patients/{an}` | GET | ดึงข้อมูลรายละเอียดผู้คลอดรายบุคคล |
| `/api/v1/labor/patients/{an}/vitals` | GET | ดึง Vital Signs ล่าสุดและประวัติ |
| `/api/v1/labor/patients/{an}/partogram` | GET | ดึงข้อมูล Partogram (Cervix, UC) |
| `/api/v1/labor/patients/{an}/cpd-score` | GET | ดึง/คำนวณ CPD Risk Score |
| `/api/v1/labor/dashboard` | GET | ดึงข้อมูลสรุป Dashboard (จำนวนผู้คลอดแยกระดับเสี่ยง) |
| `/api/v1/labor/hospitals` | GET | ดึงรายชื่อโรงพยาบาลในสังกัดพร้อมสถิติ |
| `/api/v1/labor/notifications` | POST | ส่งแจ้งเตือนไปยังผู้ใช้งาน |

#### 3.2.3 Query Parameters

| Parameter | Type | คำอธิบาย |
|-----------|------|---------|
| `hcode` | String | รหัสสถานพยาบาล (5 หลัก) กรอง รพ. เฉพาะแห่ง |
| `status` | Enum | สถานะ: `active` (ยังไม่คลอด), `delivered` (คลอดแล้ว), `all` |
| `risk_level` | Enum | ระดับ CPD Risk: `low`, `medium`, `high`, `all` |
| `date_from` / `date_to` | DateTime | ช่วงวันที่ Admit |
| `page` / `per_page` | Integer | Pagination |

### 3.3 Data Mapping จาก HOSxP

#### 3.3.1 ตาราง HOSxP ที่เกี่ยวข้อง

| ตาราง HOSxP | ข้อมูลที่ดึง | Mapping ไปยัง KK-LRMS |
|-------------|-------------|----------------------|
| `patient` | HN, ชื่อ-สกุล, เลขบัตรประชาชน, วันเกิด | Patient Demographics |
| `ovst` / `ipt` | AN, วันที่ Admit, Ward | Admission Info |
| `labor` | ข้อมูลการคลอด, Gravida, GA, ANC | Labor Data |
| `labor_vital` | HR, FHR, BP, UC (Interval/Duration/Intensity) | Vital Signs, UC Monitoring |
| `labor_cervix` | Cervix dilation, เวลาตรวจ | Partogram Data |
| `labor_detail` | PPH, Amniotic fluid, Cervix length | Labor Detail |
| `anc` | จำนวน ANC visits, ข้อมูล ANC | ANC Summary |
| `person_anc` | U/S result, Hematocrit, Height, Weight | Maternal Health |
| `opdscreen` / `iptscreen` | V/S (BP, HR, BW, Height) | Physical Examination |

#### 3.3.2 ตัวอย่าง SQL Query (ภายใน BMS Central API)

```sql
-- ดึงรายชื่อผู้คลอดที่ยังไม่คลอด (Active Labor)
SELECT
    p.hn,
    i.an,
    p.pname, p.fname, p.lname,
    p.cid,
    TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS age,
    l.gravida,
    l.ga_weeks AS ga,
    l.anc_count,
    l.admit_date,
    os.height,
    os.weight,
    pa.hematocrit,
    pa.ultrasound_weight,
    l.fundal_height,
    l.labor_status
FROM labor l
INNER JOIN ipt i ON l.an = i.an
INNER JOIN patient p ON i.hn = p.hn
LEFT JOIN opdscreen os ON i.hn = os.hn
LEFT JOIN person_anc pa ON p.hn = pa.hn
WHERE l.labor_status = 'active'
    AND l.admit_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
ORDER BY l.admit_date DESC;
```

```sql
-- ดึงข้อมูล Vital Signs สำหรับ Partogram
SELECT
    lv.vital_datetime,
    lv.maternal_hr,
    lv.fetal_hr,
    lv.sbp, lv.dbp,
    lv.uc_interval,
    lv.uc_duration,
    lv.uc_intensity,
    lc.cervix_dilation,
    ld.pph_amount,
    ld.amniotic_fluid
FROM labor_vital lv
LEFT JOIN labor_cervix lc ON lv.an = lc.an AND lv.vital_datetime = lc.check_datetime
LEFT JOIN labor_detail ld ON lv.an = ld.an
WHERE lv.an = :an
ORDER BY lv.vital_datetime ASC;
```

### 3.4 Data Sync Strategy

| รูปแบบ | คำอธิบาย | ใช้เมื่อ |
|--------|---------|---------|
| **Pull (Polling)** | KK-LRMS เรียก API เป็นระยะ (ทุก 30 วินาที) | Dashboard, Patient List |
| **Push (Webhook)** | HOSxP ส่ง Event มายัง KK-LRMS เมื่อมีข้อมูลใหม่ | ผู้ป่วยรายใหม่, อัปเดต Vital Signs |
| **On-demand** | ดึงข้อมูลเมื่อผู้ใช้เปิดดูรายละเอียด | Patient Detail, Partogram |

#### 3.4.1 Webhook Event จาก HOSxP

```
POST /api/v1/webhooks/labor-event
Content-Type: application/json
X-Webhook-Secret: <SECRET>

{
  "event": "labor.new_admission",     // หรือ "labor.vital_update", "labor.delivered"
  "hcode": "10670",
  "hospital_name": "รพ.ชุมแพ",
  "an": "6700012345",
  "hn": "000123456",
  "timestamp": "2026-03-08T10:30:00+07:00",
  "data": {
    "patient_name": "...",
    "age": 28,
    "ga": 39,
    "cpd_score": 8,
    "risk_level": "medium"
  }
}
```

### 3.5 API Response Format

#### 3.5.1 Patient List Response

```json
{
  "status": "success",
  "data": {
    "patients": [
      {
        "hn": "000105188",
        "an": "6700012345",
        "name": "นาง...",
        "age": 28,
        "gravida": 2,
        "ga": 39,
        "anc_count": 8,
        "admit_date": "2026-03-08T02:30:00+07:00",
        "hospital": {
          "hcode": "10670",
          "name": "รพ.ชุมแพ",
          "level": "M1"
        },
        "cpd_score": {
          "score": 7,
          "risk_level": "medium",
          "recommendation": null
        },
        "labor_status": "active",
        "latest_vitals": {
          "hr": 82,
          "fhr": 140,
          "sbp": 120,
          "dbp": 80,
          "cervix": 5,
          "timestamp": "2026-03-08T10:15:00+07:00"
        }
      }
    ],
    "pagination": {
      "total": 12,
      "page": 1,
      "per_page": 20
    }
  }
}
```

#### 3.5.2 Partogram Data Response

```json
{
  "status": "success",
  "data": {
    "an": "6700012345",
    "partogram": {
      "start_time": "2026-03-08T02:30:00+07:00",
      "entries": [
        {
          "datetime": "2026-03-08T04:00:00+07:00",
          "cervix_dilation": 3,
          "alert_line": 3,
          "action_line": null
        },
        {
          "datetime": "2026-03-08T06:00:00+07:00",
          "cervix_dilation": 5,
          "alert_line": 5,
          "action_line": 3
        }
      ]
    },
    "uterine_contractions": [
      {
        "datetime": "2026-03-08T10:00:00+07:00",
        "interval_minutes": 3,
        "duration_seconds": 55,
        "intensity": "moderate"
      }
    ]
  }
}
```

#### 3.5.3 CPD Risk Score Response

```json
{
  "status": "success",
  "data": {
    "an": "6700012345",
    "cpd_score": 11,
    "risk_level": "high",
    "recommendation": "ควรประสานส่งต่อทันที!",
    "factors": {
      "gravida": 1,
      "ga_weeks": 39,
      "height_cm": 150,
      "weight_diff_kg": 23,
      "fundal_height_cm": 37,
      "ultrasound_weight_g": 3700,
      "hematocrit_pct": 29
    },
    "calculated_at": "2026-03-08T10:30:00+07:00"
  }
}
```

---

## 4. ความต้องการเชิงฟังก์ชัน (Functional Requirements)

### 4.1 โมดูลการติดตาม CPD Risk Score

#### 4.1.1 คำอธิบาย

ระบบจะคำนวณ CPD Risk Score (Cephalopelvic Disproportion Risk Score) โดยอัตโนมัติจากข้อมูลที่ดึงมาจาก HOSxP ผ่าน BMS Central API เพื่อประเมินความเสี่ยงของภาวะศีรษะทารกไม่สามารถผ่านช่องเชิงกรานของมารดาได้

#### 4.1.2 ระดับความเสี่ยง

| ระดับความเสี่ยง | คะแนน | รหัสสี | การดำเนินการ |
|---------------|-------|-------|-------------|
| เสี่ยงน้อย | < 5 คะแนน | 🟢 เขียว (Green) | ติดตามปกติ |
| เสี่ยงปานกลาง | 5–9.5 คะแนน | 🟡 เหลือง (Yellow) | เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ |
| เสี่ยงสูง | ≥ 10 คะแนน | 🔴 แดง (Red) | **คำแนะนำ: ควรประสานส่งต่อทันที!** |

#### 4.1.3 ปัจจัยที่ใช้คำนวณ CPD Risk Score

ระบบคำนวณ CPD Risk Score จากปัจจัยต่อไปนี้ (ดึงจาก HOSxP อัตโนมัติ):

- จำนวนครรภ์ (Gravida) — จากตาราง `labor`
- จำนวนครั้ง ANC — จากตาราง `anc`
- อายุครรภ์ (Gestational Age) — จากตาราง `labor.ga_weeks`
- ส่วนสูงมารดา (ซม.) — จากตาราง `opdscreen.height`
- ส่วนต่างน้ำหนัก (Weight gain - กก.) — คำนวณจาก `opdscreen.weight`
- ยอดมดลูก (Fundal height - ซม.) — จากตาราง `labor.fundal_height`
- น้ำหนักเด็กจาก Ultrasound (กรัม) — จากตาราง `person_anc.ultrasound_weight`
- ค่า Hematocrit (%) — จากตาราง `person_anc.hematocrit`

#### 4.1.4 ฟังก์ชันที่ต้องมี

1. คำนวณ CPD Risk Score อัตโนมัติเมื่อได้รับข้อมูลจาก HOSxP ครบ
2. แสดง CPD Score เป็น Badge บนหน้ารายชื่อผู้ป่วย (เช่น CPD 4, CPD 7, CPD 10, CPD 12)
3. แสดงข้อความแจ้งเตือน "คำแนะนำ: ควรประสานส่งต่อทันที!" เมื่อคะแนน ≥ 10
4. Popup แจ้งเตือนเมื่อเปิดรายละเอียดผู้ป่วยที่มีความเสี่ยงสูง
5. แจ้งเตือนผ่านระบบ Notification อัตโนมัติเมื่อมีความเสี่ยงสูง
6. Re-calculate CPD Score อัตโนมัติเมื่อมี Vital Signs update จาก HOSxP (ผ่าน Webhook)

### 4.2 โมดูลการติดตาม Partogram

#### 4.2.1 คำอธิบาย

Partogram คือกราฟแสดงความคืบหน้าของการคลอด ระบบจะแสดง Partogram แบบ Digital โดยอัตโนมัติจากข้อมูลที่ HOSxP ส่งมาผ่าน API

#### 4.2.2 องค์ประกอบของกราฟ Partogram

| องค์ประกอบ | คำอธิบาย | การแสดงผล |
|-----------|---------|----------|
| Cervix Length | ความยาวปากมดลูกที่เปิด (0–10 ซม.) | เส้นสีเขียว (Cyan) พร้อมพื้นที่แรเงา |
| Alert Line | เส้นเตือน — หากปากมดลูกเปิดช้ากว่าเส้นนี้ ต้องเฝ้าระวัง | เส้นสีแดง |
| Action Line | เส้นดำเนินการ — หากปากมดลูกเปิดช้ากว่าเส้นนี้ ต้องดำเนินการทันที | เส้นสีน้ำเงิน |

#### 4.2.3 แกนกราฟ

- **แกน X:** เวลา (ชั่วโมง 0–24)
- **แกน Y:** ขนาดปากมดลูกที่เปิด (0–10 ซม.)

#### 4.2.4 ฟังก์ชันที่ต้องมี

1. พล็อตกราฟ Partogram อัตโนมัติจากข้อมูล `labor_cervix` ใน HOSxP
2. แสดง 3 เส้น (Cervix length, Alert line, Action line) ในกราฟเดียวกัน
3. อัปเดตกราฟแบบ Real-time เมื่อมีข้อมูลใหม่จาก API
4. แสดงตัวเลข Cervix Dilation ล่าสุดใน Badge วงกลมขนาดใหญ่
5. แสดงวันที่และเวลาของข้อมูลล่าสุด

### 4.3 โมดูลข้อมูลผู้คลอด (Patient Data Module)

#### 4.3.1 ข้อมูลพื้นฐาน (Demographics) — ดึงจาก HOSxP

| ฟิลด์ | ชนิดข้อมูล | HOSxP Source | ตัวอย่าง |
|-------|-----------|-------------|---------|
| HN (Hospital Number) | String | `patient.hn` | 000105188 |
| AN (Admission Number) | String | `ipt.an` | 6700012345 |
| เลขบัตรประชาชน | String (13 หลัก) | `patient.cid` | 1400XXXXXXXXX |
| ชื่อ-สกุล | String | `patient.pname + fname + lname` | (ปกปิดข้อมูลส่วนบุคคล) |
| อายุ | Integer (ปี) | คำนวณจาก `patient.birthday` | 17, 24, 28, 35 |
| จำนวนครรภ์ (Gravida) | Integer | `labor.gravida` | 1, 3, 5 |
| จำนวนครั้ง ANC | Integer | `COUNT(anc)` | 1, 7, 14 |
| อายุครรภ์ (GA) | Integer (สัปดาห์) | `labor.ga_weeks` | 32, 39, 43 |
| วันที่ Admit | DateTime | `ipt.regdate + regtime` | 2026-03-08 02:30 |

#### 4.3.2 ข้อมูลสุขภาพมารดา — ดึงจาก HOSxP

| ตัวชี้วัด | หน่วย | HOSxP Source | ตัวอย่างค่า |
|----------|-------|-------------|-----------|
| ส่วนสูง (Height) | ซม. | `opdscreen.height` | 150, 155, 161 |
| น้ำหนัก / ส่วนต่างน้ำหนัก | กก. | `opdscreen.weight` | 70→85 (15) |
| ยอดมดลูก (Fundal Height) | ซม. | `labor.fundal_height` | 32, 37 |
| Hematocrit | % | `person_anc.hematocrit` | 29, 33, 38 |
| อัตราการเต้นหัวใจแม่ (HR) | ครั้ง/นาที | `labor_vital.maternal_hr` | 78, 93, 100 |
| ความดันโลหิต (SBP/DBP) | mmHg | `labor_vital.sbp / dbp` | 110/80, 150/100 |
| Ultrasound น้ำหนักเด็ก (U/S) | กรัม | `person_anc.ultrasound_weight` | 2600, 3250, 3700 |

#### 4.3.3 ข้อมูลการคลอด (Labor Data) — ดึงจาก HOSxP

| ตัวชี้วัด | หน่วย | HOSxP Source | ตัวอย่างค่า |
|----------|-------|-------------|-----------|
| ปากมดลูกเปิด (Cervix Length) | ซม. | `labor_cervix.cervix_dilation` | 6, 9, 10 |
| อัตราการเต้นหัวใจลูก (FHR) | ครั้ง/นาที | `labor_vital.fetal_hr` | 124, 148, 175 |
| การตกเลือดหลังคลอด (PPH) | มล. | `labor_detail.pph_amount` | 150, 200, 550 |
| ลักษณะน้ำคร่ำ | Text | `labor_detail.amniotic_fluid` | ใส (clear) |
| UC Interval | นาที | `labor_vital.uc_interval` | 2, 3, 8 |
| UC Duration | วินาที | `labor_vital.uc_duration` | 45, 55 |
| UC Intensity | Enum | `labor_vital.uc_intensity` | mild, moderate, strong |
| สถานะการคลอด | Enum | `labor.labor_status` | active / delivered |

### 4.4 โมดูล Dashboard

#### 4.4.1 Dashboard หน้ารายชื่อโรงพยาบาล

แสดงข้อมูลรายโรงพยาบาลในจังหวัดขอนแก่น แยกตาม CPD Risk Score:

| โรงพยาบาล | เสี่ยงน้อย | เสี่ยงปานกลาง | เสี่ยงสูง | รวม |
|----------|----------|-------------|---------|-----|
| รพ.ชุมแพ | - | 2 | - | 2 |
| รพ.น้ำพอง | - | 1 | 1 | 2 |
| รพ.บ้านไผ่ | 1 | 2 | - | 3 |
| รพ.พล | - | 1 | - | 1 |
| รพ.ภูเวียง | - | 2 | 1 | 3 |
| ... | ... | ... | ... | ... |

#### 4.4.2 Dashboard ภาพรวม

แสดงสรุปจำนวนผู้คลอดที่กำลังรอคลอดในจังหวัดขอนแก่น:

- จำนวน CPD Score เสี่ยงน้อย, ปานกลาง, สูง
- เวลาปัจจุบัน (นาฬิกา Real-time)
- ช่วงวันที่ข้อมูล
- สถานะการเชื่อมต่อ HOSxP แต่ละ รพช. (Online/Offline)

#### 4.4.3 Dashboard รายผู้ป่วย (Patient Detail View)

แสดงข้อมูลเชิงลึกของผู้คลอดแต่ละราย ข้อมูลทั้งหมดดึงจาก HOSxP ผ่าน API:

- ข้อมูลพื้นฐาน: HN, AN, อายุ, วันที่ Admit, สถานะ (ยังไม่คลอด/คลอดแล้ว)
- ข้อมูลครรภ์: Gravida, ANC visits, GA, Height, Weight diff, Fundal height, U/S, Hematocrit
- ตัวชี้วัดทางคลินิก (แสดงเป็น Widget วงกลมพร้อมกราฟ): HR, FHR, SBP/DBP, PPH
- กราฟ Partogram แบบ Interactive
- ตารางบันทึกการบีบรัดของมดลูก (Time, Interval, Duration, Intensity)
- CPD Risk Score Badge พร้อมปุ่มคำแนะนำส่งต่อ
- ปุ่มพิมพ์ (Print) สำหรับเอกสาร
- ปุ่มบันทึก (Save)
- แสดงชื่อ รพช. ต้นทางและเวลาอัปเดตล่าสุดจาก HOSxP

### 4.5 โมดูลกราฟ Vital Signs

ระบบแสดง Vital Signs ของผู้คลอดเป็นกราฟแนวโน้ม (Trend Graph) จำนวน 4 กราฟ:

| กราฟ | ชื่อเต็ม | หน่วย | HOSxP Source | การแสดงผล |
|-----|---------|-------|-------------|----------|
| HR | อัตราหัวใจแม่ | ครั้ง/นาที | `labor_vital.maternal_hr` | กราฟเส้นสีชมพู |
| FHR | อัตราหัวใจลูกในครรภ์ | ครั้ง/นาที | `labor_vital.fetal_hr` | กราฟเส้นสีชมพู |
| BP | ความดันโลหิตแม่ | mmHg | `labor_vital.sbp / dbp` | กราฟแท่ง SBP/DBP |
| PPH | การตกเลือดหลังคลอด | มล. | `labor_detail.pph_amount` | กราฟแท่งสีฟ้า |

แต่ละกราฟจะแสดง: ค่าล่าสุดใน Badge วงกลมขนาดใหญ่, วันที่/เวลาอัปเดตล่าสุด, แนวโน้มตลอดช่วงเวลาที่ Admit

---

## 5. ความต้องการด้านอื่น ๆ (Non-Functional Requirements)

### 5.1 แพลตฟอร์มและเทคโนโลยี

| รายการ | รายละเอียด |
|--------|-----------|
| ชื่อระบบ | KK-LRMS (Khon Kaen Labor Room Monitoring System) |
| ลักษณะแอปพลิเคชัน | Web Application (รองรับ Desktop และ Tablet) |
| Data Source | HOSxP HIS ผ่าน BMS Central API |
| Authentication | BMS Session API (JWT Token) |
| พื้นที่ให้บริการ | จังหวัดขอนแก่น (เขตสุขภาพที่ 7) |

### 5.2 Performance Requirements

- Dashboard ต้องอัปเดตข้อมูลแบบ Real-time หรือ Near Real-time (ภายใน 30 วินาที)
- กราฟ Partogram และ Vital Signs ต้องอัปเดตทันทีเมื่อมีข้อมูลใหม่จาก HOSxP
- BMS Central API ต้อง Response ภายใน 2 วินาทีต่อ Request
- ระบบต้องรองรับผู้ใช้พร้อมกันอย่างน้อย 200 คนต่อจังหวัด
- Webhook จาก HOSxP ต้องประมวลผลภายใน 5 วินาที

### 5.3 Security Requirements

- ข้อมูลผู้ป่วยต้องเป็นไปตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)
- การเชื่อมต่อ BMS Central API ต้องใช้ JWT Token พร้อม Expiration
- ระบบต้องมี Login/Logout และ Session Management
- การเข้าถึงข้อมูลต้องแบ่งตามสิทธิ์ (Role-based Access Control)
- การมองเห็นข้อมูลผู้ป่วยต้องจำกัดตาม รพ. ของผู้ใช้ (Hospital-scoped visibility) — ผู้ใช้ของ รพ. เห็นคนไข้ของ รพ. ตัวเอง, คนไข้ที่ รพ. อื่นส่งต่อเข้ามา (อ้างอิงใบส่งต่อจาก `referin`/`referout` ผ่าน `refer_hospcode`) และคนไข้ของ รพ. ที่อยู่ในกำกับของ รพ.โหนด ส่วน รพ.ศูนย์ (ระดับ P/P+) และ สสจ. เห็นทั้งจังหวัด ตัวเลขสรุประดับจังหวัดยังแสดงครบทุก รพ. (ไม่มีข้อมูลระบุตัวบุคคล)
- API Communication ต้องใช้ HTTPS/TLS 1.2+
- API Key สำหรับแต่ละ รพช. ต้องแยกกัน สามารถ Revoke ได้
- Audit Log สำหรับการเข้าถึงข้อมูลผู้ป่วยทุกครั้ง

### 5.4 Availability & Reliability

- ระบบ KK-LRMS ต้อง Uptime ≥ 99.5%
- BMS Central API ต้องมี Retry mechanism เมื่อ HOSxP ไม่ตอบสนอง
- Dashboard ต้องแสดงสถานะการเชื่อมต่อ HOSxP แต่ละ รพช. (Online/Offline/Last Sync)
- หาก HOSxP ของ รพช. ใด Offline ระบบต้องแสดงข้อมูลล่าสุดที่ Cached ไว้ พร้อมแจ้งเตือน

### 5.5 Usability Requirements

- รองรับการใช้งานบน Tablet (iPad) สำหรับการ Monitor ในห้องคลอด
- แสดงข้อมูลเป็นภาษาไทยเป็นหลัก มีภาษาอังกฤษสำหรับคำทางการแพทย์
- รหัสสี (เขียว/เหลือง/แดง) ต้องชัดเจนและสอดคล้องทั้งระบบ
- สามารถพิมพ์ (Print) ข้อมูลผู้ป่วยและแบบบันทึกการเปลี่ยนแปลงอาการได้

---

## 6. Data Flow และ Workflow

### 6.1 Workflow การลงทะเบียนผู้คลอด

```
พยาบาล รพช.                    HOSxP                BMS Central API           KK-LRMS
    │                            │                        │                      │
    │─── บันทึกข้อมูลผู้คลอด ──▶│                        │                      │
    │                            │── Webhook ────────────▶│                      │
    │                            │   labor.new_admission  │── Forward Event ───▶│
    │                            │                        │                      │── คำนวณ CPD Score
    │                            │                        │                      │── แสดงบน Dashboard
    │                            │                        │                      │
    สูติแพทย์ / พยาบาล รพ.ขอนแก่น เห็นข้อมูลผ่าน Dashboard ◀────────────────────│
    │                            │                        │                      │
    หาก CPD ≥ 10 ──▶ แจ้งเตือนบน Dashboard "ควรประสานส่งต่อทันที!" ──▶ ส่งต่อตาม MOU เขต 7
```

### 6.2 Workflow การ Monitor ระหว่างรอคลอด

1. พยาบาล รพช. บันทึก Vital Signs และ Cervix ใน HOSxP เป็นระยะ
2. HOSxP ส่ง Webhook `labor.vital_update` ไปยัง BMS Central API
3. KK-LRMS รับข้อมูลและอัปเดตกราฟ Partogram + Vital Signs แบบ Real-time
4. สูติแพทย์ รพ.ขอนแก่น สามารถ Monitor ผ่าน Dashboard ได้ตลอดเวลา
5. เมื่อ Cervix เปิดถึง Alert Line หรือ Action Line — ระบบแจ้งเตือนบน Dashboard
6. เมื่อคลอดแล้ว HOSxP ส่ง Webhook `labor.delivered` — สถานะเปลี่ยนเป็น "คลอดแล้ว"

### 6.3 Workflow การ Sync ข้อมูล (Fallback)

กรณี Webhook ไม่ทำงาน ระบบจะ Fallback เป็น Polling:

1. KK-LRMS เรียก `GET /api/v1/labor/patients?status=active` ทุก 30 วินาที
2. เปรียบเทียบกับข้อมูลล่าสุดที่ Cache ไว้
3. หากมีข้อมูลใหม่หรือเปลี่ยนแปลง — อัปเดต Dashboard

### 6.4 แบบบันทึกการเปลี่ยนแปลงอาการ (Print Form)

ระบบรองรับการพิมพ์แบบบันทึกการเปลี่ยนแปลงอาการของผู้คลอดที่มีคอลัมน์:

> ว/ด/ป เวลา | V/S | UC | FHS | Cervix | ชื่อผู้ตรวจ | SOS | Med | หมายเหตุ

สามารถ Pre-fill ข้อมูลจาก HOSxP ก่อนพิมพ์ได้

---

## 7. รายการหน้าจอ (UI Screens)

| # | ชื่อหน้าจอ | คำอธิบาย |
|---|-----------|---------|
| 1 | Dashboard ภาพรวม | แสดงจำนวนผู้คลอดแยกตามระดับ CPD Risk Score, ตารางราย รพช., นาฬิกา Real-time, สถานะ HOSxP Connection |
| 2 | รายชื่อผู้คลอดรายโรงพยาบาล | แสดงรายชื่อผู้คลอดของแต่ละ รพช. พร้อม CPD Badge, สถานะคลอด, ปุ่มรายละเอียด |
| 3 | รายละเอียดผู้คลอด | ข้อมูลครบถ้วน: Demographics, Lab, Partogram, Vital Signs, UC Monitoring, CPD Alert (ทั้งหมดจาก HOSxP) |
| 4 | Partogram Graph | กราฟ Partogram แบบ Interactive แสดง Cervix/Alert/Action line |
| 5 | Vital Signs Trend | กราฟแนวโน้ม HR, FHR, BP, PPH พร้อม Badge ค่าล่าสุด |
| 6 | UC Monitoring Table | ตารางบันทึกการบีบรัดของมดลูก (Time, Interval, Duration, Intensity) |
| 7 | แบบบันทึกอาการ (Print) | หน้าพิมพ์แบบฟอร์มบันทึกอาการ Pre-fill จาก HOSxP |
| 8 | Login / Logout | เข้าสู่ระบบด้วย BMS Session API (JWT) |
| 9 | API Connection Status | แสดงสถานะการเชื่อมต่อ HOSxP แต่ละ รพช. (Online/Offline/Last Sync) |
| 10 | Admin Settings | จัดการ API Key, Webhook URL, รายชื่อ รพช. |

---

## 8. คำศัพท์ (Glossary)

| คำศัพท์ | ความหมาย |
|--------|---------|
| KK-LRMS | Khon Kaen Labor Room Monitoring System — ระบบติดตามการคลอดแบบรวมศูนย์จังหวัดขอนแก่น |
| HOSxP | Hospital Operating System x Platform — ระบบ HIS หลักของ รพช. ในประเทศไทย (พัฒนาโดย BMS) |
| BMS Central API | API กลางสำหรับเชื่อมต่อข้อมูลจาก HOSxP หลาย รพช. (ใช้ BMS Session API + JWT) |
| BMS Session API | ระบบ Authentication ด้วย JWT Token สำหรับเข้าถึงฐานข้อมูล HOSxP อย่างปลอดภัย |
| CPD | Cephalopelvic Disproportion — ภาวะศีรษะทารกไม่สามารถผ่านช่องเชิงกรานมารดาได้ |
| Partogram | กราฟแสดงความคืบหน้าของการคลอด |
| GA | Gestational Age — อายุครรภ์ (สัปดาห์) |
| ANC | Antenatal Care — การดูแลก่อนคลอด |
| FHR | Fetal Heart Rate — อัตราการเต้นหัวใจทารกในครรภ์ |
| PPH | Postpartum Hemorrhage — การตกเลือดหลังคลอด |
| Hematocrit | สัดส่วนปริมาตรเม็ดเลือดแดงต่อปริมาตรเลือดทั้งหมด |
| U/S | Ultrasound — การตรวจด้วยคลื่นเสียงความถี่สูง |
| UC | Uterine Contraction — การบีบรัดตัวของมดลูก |
| SBP/DBP | Systolic/Diastolic Blood Pressure — ความดันโลหิตตัวบน/ตัวล่าง |
| รพช. | โรงพยาบาลชุมชน |
| MOU | Memorandum of Understanding — บันทึกข้อตกลงความร่วมมือ |
| Webhook | กลไกที่ HOSxP ส่ง HTTP Request แจ้งเหตุการณ์ไปยัง KK-LRMS แบบ Real-time |
| JWT | JSON Web Token — มาตรฐานการยืนยันตัวตนระหว่างระบบ |
| HCODE | รหัสสถานพยาบาล 5 หลัก ที่กำหนดโดย สธ. |
