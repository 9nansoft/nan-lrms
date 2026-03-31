# KK-LRMS Webhook API Specification

**Version:** 2.0
**Base URL:** `https://kk-lrms.bmscloud.in.th`
**Contact:** สำนักงานสาธารณสุขจังหวัดขอนแก่น (สสจ.ขอนแก่น)

## Overview

The KK-LRMS Webhook API allows **non-HOSxP hospitals** (private hospitals, hospitals using other HIS systems) to submit patient data into the centralized monitoring system. The API supports the full pregnancy continuum:

| Data Type | Description | Payload `type` |
|-----------|-------------|----------------|
| **Labor** | Active labor room patients | _(none — default)_ |
| **ANC** | Pregnancy registration + prenatal visit data | `"anc_data"` |
| **Referral** | Inter-hospital referral status updates | `"referral_update"` |

All data receives identical processing to HOSxP-polled data:

- Patient name and CID encrypted (AES-256-GCM, PDPA compliant)
- CPD Risk Score calculated automatically (labor patients)
- ANC Risk Level classified by 4-tier model (pregnancy patients)
- Cross-hospital transfer detection via CID hash
- Real-time SSE broadcast to dashboard clients
- Hospital connection status updated to ONLINE

---

## Authentication

All webhook requests require a **Bearer token** in the `Authorization` header.

```
Authorization: Bearer kklrms_a1b2c3d4e5f6789012345678901234567890
```

### API Key Format

| Property     | Value                          |
|-------------|--------------------------------|
| Prefix      | `kklrms_`                      |
| Key length  | 47 characters (prefix + 40 hex)|
| Storage     | SHA-256 hash (raw key never stored) |
| Scope       | Bound to one hospital          |
| Revocation  | Immediate, irreversible        |

> **Important:** The raw API key is shown **only once** when created. Store it securely.

### Obtaining an API Key

Contact the KK-LRMS administrator (สสจ.ขอนแก่น) to register your hospital and receive an API key. The admin will:

1. Register your hospital in the system (assign HCODE)
2. Generate an API key bound to your hospital
3. Provide the raw key (one-time display)

---

## Common Rules

### Hospital Code Validation

All payloads require a `hospitalCode` field. The system validates that `hospitalCode` matches the API key's hospital. If mismatched → **403 Forbidden**.

```json
{ "error": "hospitalCode \"10679\" ไม่ตรงกับ API key ของโรงพยาบาล \"10670\"" }
```

### Record Matching (Compound Keys)

Every record type uses `hospitalCode` + a natural key for matching:

| Type | Compound Key | Create | Update | Delete |
|------|-------------|--------|--------|--------|
| Labor | `hospitalCode` + `an` | New `an` → auto-insert | Existing `an` → auto-update | `action: "delete"` |
| ANC | `hospitalCode` + `hn` | New `hn` → auto-insert | Existing `hn` → auto-update | `action: "delete"` |
| Referral | `hospitalCode` + `referralId` | Via `/api/referrals` only | `referralId` + new `status` | `action: "delete"` |

### Delete Operations

All types support `action: "delete"` for human error correction. Deletes remove the record and all related child data.

---

## Endpoint

```
POST /api/webhooks/patient-data
```

### Headers

| Header          | Value                              | Required |
|----------------|------------------------------------|----------|
| Content-Type   | `application/json`                 | Yes      |
| Authorization  | `Bearer <api-key>`                 | Yes      |

### Routing

The system routes to the appropriate handler based on the `type` field:

| `type` field | Handler |
|-------------|---------|
| _(absent)_ | Labor patient processing |
| `"anc_data"` | ANC pregnancy processing |
| `"referral_update"` | Referral status processing |

---

## 1. Labor Patient Data (default)

Submit labor room patient data. Supports up to **100 patients** per request.

### Request Body

```json
{
  "hospitalCode": "10679",
  "mode": "incremental",
  "patients": [
    {
      "hn": "HN-001",
      "an": "AN-2026-001",
      "name": "นาง ทดสอบ ระบบ",
      "cid": "1100500012345",
      "age": 28,
      "gravida": 1,
      "ga_weeks": 41,
      "anc_count": 3,
      "admit_date": "2026-03-08T08:00:00+07:00",
      "height_cm": 148,
      "weight_kg": 75,
      "weight_diff_kg": 20,
      "fundal_height_cm": 37,
      "us_weight_g": 4000,
      "hematocrit_pct": 29,
      "labor_status": "ACTIVE"
    }
  ]
}
```

### Required Fields

| Field        | Type   | Description                                    |
|-------------|--------|------------------------------------------------|
| `hospitalCode` | string | Hospital HCODE (must match API key) |
| `hn`        | string | Hospital Number (unique within hospital)  |
| `an`        | string | Admission Number (**match key** for upsert) |
| `name`      | string | Patient full name (auto-encrypted per PDPA)    |
| `age`       | number | Patient age in years                           |
| `admit_date`| string | Admission datetime (ISO 8601)                  |

### Optional Fields — CPD Risk Factors

| Field              | Type   | Description                         | CPD Score Impact |
|-------------------|--------|-------------------------------------|-----------------|
| `cid`             | string | National ID (13 digits, auto-encrypted) | Transfer detection |
| `gravida`         | number | Pregnancy count (ครรภ์ที่)           | Gravida=1 → +2 pts |
| `ga_weeks`        | number | Gestational age in weeks            | ≥40 → +1.5 pts |
| `anc_count`       | number | Antenatal care visits               | <4 → +1.5 pts |
| `height_cm`       | number | Maternal height in cm               | <150 → +2 pts |
| `weight_kg`       | number | Current weight in kg                | — |
| `weight_diff_kg`  | number | Weight gain during pregnancy        | >20 → +2 pts |
| `fundal_height_cm`| number | Fundal height in cm                 | >36 → +2 pts |
| `us_weight_g`     | number | Estimated fetal weight by U/S       | >3500 → +2 pts |
| `hematocrit_pct`  | number | Hematocrit percentage               | <30 → +1.5 pts |
| `labor_status`    | string | `"ACTIVE"` (default) or `"DELIVERED"` | — |
| `action`          | string | `"upsert"` (default) or `"delete"` | — |

### Ingestion Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `incremental` (default) | Upsert patients in payload. Others **unchanged**. | Event-driven systems |
| `full_snapshot` | Upsert patients in payload. Others **auto-discharged**. | Periodic batch exports |

### Response

```json
{
  "success": true,
  "patientsProcessed": 1,
  "newAdmissions": 1,
  "discharges": 0,
  "transfers": 0,
  "deleted": 0,
  "timestamp": "2026-03-08T08:00:05.123Z"
}
```

### Examples

```bash
# CREATE — new labor admission
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "patients": [{
      "hn": "HN-12345",
      "an": "AN-2026-0001",
      "name": "นาง สมศรี ใจดี",
      "cid": "1100500012345",
      "age": 28,
      "gravida": 1,
      "ga_weeks": 41,
      "anc_count": 3,
      "admit_date": "2026-03-19T08:00:00+07:00",
      "height_cm": 148,
      "weight_diff_kg": 20,
      "fundal_height_cm": 37,
      "us_weight_g": 4000,
      "hematocrit_pct": 29
    }]
  }'

# UPDATE — same AN, updated vitals
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "patients": [{
      "hn": "HN-12345",
      "an": "AN-2026-0001",
      "name": "นาง สมศรี ใจดี",
      "age": 28,
      "ga_weeks": 42,
      "admit_date": "2026-03-19T08:00:00+07:00",
      "hematocrit_pct": 28
    }]
  }'

# DISCHARGE — mark as delivered
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "patients": [{
      "hn": "HN-12345",
      "an": "AN-2026-0001",
      "name": "นาง สมศรี ใจดี",
      "age": 28,
      "admit_date": "2026-03-19T08:00:00+07:00",
      "labor_status": "DELIVERED"
    }]
  }'

# DELETE — remove wrong admission
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "patients": [{
      "hn": "HN-12345",
      "an": "AN-2026-0001",
      "name": "นาง สมศรี ใจดี",
      "age": 28,
      "admit_date": "2026-03-19T08:00:00+07:00",
      "action": "delete"
    }]
  }'

# FULL SNAPSHOT — send all active patients (missing = auto-discharged)
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "mode": "full_snapshot",
    "patients": [
      { "hn": "HN-001", "an": "AN-001", "name": "Patient A", "age": 25, "admit_date": "2026-03-19T08:00:00+07:00" },
      { "hn": "HN-002", "an": "AN-002", "name": "Patient B", "age": 30, "admit_date": "2026-03-19T10:00:00+07:00" }
    ]
  }'

# MIX — create + update + delete in one request
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "hospitalCode": "10679",
    "patients": [
      { "hn": "HN-NEW", "an": "AN-NEW", "name": "คนใหม่", "age": 25, "admit_date": "2026-03-19T12:00:00+07:00" },
      { "hn": "HN-001", "an": "AN-001", "name": "Patient A", "age": 25, "admit_date": "2026-03-19T08:00:00+07:00", "ga_weeks": 40 },
      { "hn": "HN-ERR", "an": "AN-ERR", "name": "ข้อมูลผิด", "age": 20, "admit_date": "2026-03-19T06:00:00+07:00", "action": "delete" }
    ]
  }'
```

---

## 2. ANC Data (`type: "anc_data"`)

Submit pregnancy registration and prenatal visit data.

### Request Body

```json
{
  "type": "anc_data",
  "hospitalCode": "10679",
  "patients": [
    {
      "hn": "650010",
      "name": "มาลี รักษาครรภ์",
      "cid": "1100700123456",
      "birthday": "1998-05-15",
      "pregNo": 1,
      "lmp": "2025-09-01",
      "edc": "2026-06-08",
      "riskLevel": "HR1",
      "visits": [
        {
          "date": "2025-12-01",
          "visitNumber": 1,
          "gaWeeks": 13,
          "fundalHeightCm": 12,
          "weightKg": 52,
          "bpSystolic": 110,
          "bpDiastolic": 70,
          "fetalHr": 150
        }
      ]
    }
  ]
}
```

### Patient Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hn` | string | Yes | Hospital Number (**match key**) |
| `name` | string | Yes | Patient name (auto-encrypted) |
| `birthday` | string | Yes | Date of birth (YYYY-MM-DD) |
| `pregNo` | number | Yes | Pregnancy number (ครรภ์ที่) |
| `cid` | string | No | National ID (auto-encrypted) |
| `lmp` | string | No | Last menstrual period (YYYY-MM-DD) |
| `edc` | string | No | Expected date of confinement |
| `riskLevel` | string | No | `LOW`, `HR1`, `HR2`, `HR3` |
| `visits` | array | No | ANC visit records |
| `action` | string | No | `"upsert"` (default) or `"delete"` |

### Visit Fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Visit date (YYYY-MM-DD) |
| `visitNumber` | number | Visit sequence (1, 2, 3...) |
| `gaWeeks` | number | Gestational age at visit |
| `fundalHeightCm` | number | Fundal height (cm) |
| `weightKg` | number | Maternal weight (kg) |
| `bpSystolic` | number | Blood pressure systolic |
| `bpDiastolic` | number | Blood pressure diastolic |
| `fetalHr` | number | Fetal heart rate |

### ANC Risk Levels

| Level | Thai | Facility | Provider |
|-------|------|----------|----------|
| `LOW` | ความเสี่ยงต่ำ | รพ.สต. | พยาบาล/จนท. |
| `HR1` | เสี่ยงสูง ระดับ 1 | รพ.ชุมชน | แพทย์/พยาบาล |
| `HR2` | เสี่ยงสูง ระดับ 2 | รพช.แม่ข่าย/รพท. | สูติแพทย์ |
| `HR3` | เสี่ยงสูง ระดับ 3 | รพ.จังหวัด/รพศ. | สูติแพทย์/MFM |

### Response

```json
{
  "success": true,
  "patientsProcessed": 1,
  "created": 1,
  "updated": 0,
  "deleted": 0,
  "timestamp": "2026-03-19T08:00:05.123Z"
}
```

### Examples

```bash
# CREATE — register new pregnancy with visits
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "anc_data",
    "hospitalCode": "10679",
    "patients": [{
      "hn": "650010",
      "name": "มาลี รักษาครรภ์",
      "cid": "1100700123456",
      "birthday": "1998-05-15",
      "pregNo": 1,
      "lmp": "2025-09-01",
      "edc": "2026-06-08",
      "riskLevel": "HR1",
      "visits": [
        { "date": "2025-12-01", "visitNumber": 1, "gaWeeks": 13, "fundalHeightCm": 12, "weightKg": 52, "bpSystolic": 110, "bpDiastolic": 70, "fetalHr": 150 },
        { "date": "2026-02-01", "visitNumber": 2, "gaWeeks": 22, "fundalHeightCm": 22, "weightKg": 55, "bpSystolic": 118, "bpDiastolic": 75, "fetalHr": 145 }
      ]
    }]
  }'

# UPDATE — same HN, add visit + change risk level
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "anc_data",
    "hospitalCode": "10679",
    "patients": [{
      "hn": "650010",
      "name": "มาลี รักษาครรภ์",
      "birthday": "1998-05-15",
      "pregNo": 1,
      "riskLevel": "HR2",
      "visits": [
        { "date": "2026-03-15", "visitNumber": 3, "gaWeeks": 28, "bpSystolic": 145, "bpDiastolic": 92, "fetalHr": 142 }
      ]
    }]
  }'

# DELETE — wrong pregnancy record
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "anc_data",
    "hospitalCode": "10679",
    "patients": [{
      "hn": "650010",
      "name": "มาลี รักษาครรภ์",
      "birthday": "1998-05-15",
      "pregNo": 1,
      "action": "delete"
    }]
  }'
```

> **Delete cascades:** Removing a pregnancy record also removes all related ANC visits, risk assessments, newborn records, and referrals.

---

## 3. Referral Update (`type: "referral_update"`)

Update the status of an inter-hospital referral.

### Request Body

```json
{
  "type": "referral_update",
  "hospitalCode": "10670",
  "referralId": "REF-2026-0001",
  "status": "ACCEPTED",
  "reason": "เตียง L&D ว่าง รับได้"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hospitalCode` | string | Yes | Hospital HCODE (must match API key) |
| `referralId` | string | Yes | External referral ID (**match key** with hospitalCode) |
| `status` | string | Yes | New status (see below) |
| `reason` | string | No | Reason for status change |
| `transportMode` | string | No | `"ambulance"`, `"self"`, etc. (for IN_TRANSIT) |
| `arrivedAt` | string | No | Arrival datetime ISO 8601 (for ARRIVED) |
| `action` | string | No | `"update"` (default) or `"delete"` |

### Referral Statuses

```
INITIATED → ACCEPTED → IN_TRANSIT → ARRIVED
         → REJECTED
```

| Status | Description | Thai |
|--------|-------------|------|
| `ACCEPTED` | Receiving hospital accepts | รับส่งต่อ |
| `IN_TRANSIT` | Patient in transit | กำลังเดินทาง |
| `ARRIVED` | Patient arrived at destination | ถึงปลายทาง |
| `REJECTED` | Receiving hospital rejects | ปฏิเสธ |

### Response

```json
{
  "success": true,
  "referralId": "REF-2026-0001",
  "status": "ACCEPTED",
  "timestamp": "2026-03-19T14:30:00.123Z"
}
```

### Examples

```bash
# ACCEPT referral
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "referral_update",
    "hospitalCode": "10670",
    "referralId": "REF-2026-0001",
    "status": "ACCEPTED",
    "reason": "เตียง L&D ว่าง รับได้"
  }'

# MARK IN TRANSIT
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "referral_update",
    "hospitalCode": "10670",
    "referralId": "REF-2026-0001",
    "status": "IN_TRANSIT",
    "transportMode": "ambulance"
  }'

# CONFIRM ARRIVAL
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "referral_update",
    "hospitalCode": "10670",
    "referralId": "REF-2026-0001",
    "status": "ARRIVED",
    "arrivedAt": "2026-03-19T14:30:00+07:00"
  }'

# DELETE — referral entered by mistake
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key_here" \
  -d '{
    "type": "referral_update",
    "hospitalCode": "10670",
    "referralId": "REF-2026-0001",
    "status": "CANCELLED",
    "action": "delete"
  }'
```

> **Note:** Referrals are initiated via the KK-LRMS dashboard (`POST /api/referrals`), not via webhook. The webhook is for status updates from the receiving hospital.

---

## Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "\"patients\" must be an array" }` | Invalid JSON or missing required fields |
| 400 | `{ "error": "\"patients\" array must not be empty" }` | Empty patients array |
| 400 | `{ "error": "\"patients\" array must not exceed 100 items per request" }` | Too many patients (labor) |
| 400 | `{ "error": "\"referralId\" is required (string)" }` | Missing referral ID |
| 400 | `{ "error": "\"status\" is required (string)" }` | Missing referral status |
| 401 | `{ "error": "Missing or invalid Authorization header..." }` | No Bearer token |
| 401 | `{ "error": "Invalid or revoked API key" }` | Wrong key or revoked |
| 403 | `{ "error": "hospitalCode \"X\" ไม่ตรงกับ API key..." }` | hospitalCode mismatch |
| 500 | `{ "error": "Internal server error" }` | Server-side error |

---

## SSE Events Broadcast

All webhook operations trigger real-time SSE events to connected dashboard clients:

| Webhook Type | SSE Event | Data Fields |
|-------------|-----------|-------------|
| Labor — new admission | `patient_update` | `type: "new_admission"`, `hcode`, `an` |
| Labor — discharge | `patient_update` | `type: "patient_discharged"`, `hcode`, `an` |
| Labor — transfer | `patient_update` | `type: "patient_transfer"`, `fromHcode`, `toHcode`, `an` |
| ANC — create/update | `patient_update` | `type: "journey_update"`, `hcode`, `journeyId`, `careStage`, `ancRiskLevel` |
| ANC — delete | `patient_update` | `type: "journey_update"`, `hcode`, `journeyId`, `careStage: "DELETED"` |
| Referral — update | `patient_update` | `type: "referral_update"`, `fromHcode`, `toHcode`, `referralId`, `status` |
| Referral — delete | `patient_update` | `type: "referral_update"`, `fromHcode`, `referralId`, `status: "DELETED"` |
| Sync complete | `sync_complete` | `hcode`, `patientsUpdated`, `source: "webhook"` |

---

## Admin API (API Key Management)

These endpoints require admin authentication (login to KK-LRMS with admin role).

### List API Keys

```
GET /api/admin/webhooks
```

### Create API Key

```
POST /api/admin/webhooks
```

```json
{ "hcode": "99901", "label": "Production Key" }
```

Response (201):

```json
{
  "id": "550e8400-...",
  "apiKey": "kklrms_a1b2c3d4e5f6789012345678901234567890",
  "keyPrefix": "kklrms_a",
  "hospitalName": "รพ.เอกชนทดสอบ",
  "hcode": "99901",
  "label": "Production Key",
  "message": "API key created. Save this key — it will not be shown again."
}
```

### Revoke API Key

```
DELETE /api/admin/webhooks/:keyId
```

---

## Integration Guide

### Periodic Systems (full_snapshot)

```
┌──────────────┐     every 5-30 min      ┌──────────────────┐
│  Your HIS    │ ───── full_snapshot ────→ │  KK-LRMS API     │
│  (Database)  │     POST /api/webhooks/  │  Dashboard auto-  │
│              │     patient-data         │  updates via SSE  │
└──────────────┘                          └──────────────────┘
```

1. Query your database for all active labor patients
2. Map each row to the webhook payload format
3. Send as `full_snapshot` — discharged patients handled automatically
4. Recommended interval: **every 5 minutes**

### Event-Driven Systems (incremental)

```
┌──────────────┐    on each event         ┌──────────────────┐
│  Your HIS    │ ───── incremental ─────→ │  KK-LRMS API     │
│  (Events)    │     POST /api/webhooks/  │  Dashboard auto-  │
│              │     patient-data         │  updates via SSE  │
└──────────────┘                          └──────────────────┘
```

1. On admit: send patient with `labor_status: "ACTIVE"`
2. On update: send updated fields (same `an`)
3. On discharge: send with `labor_status: "DELIVERED"`
4. On error correction: send with `action: "delete"`

### ANC Systems

```
┌──────────────┐    on ANC visit          ┌──────────────────┐
│  Your HIS    │ ── type: "anc_data" ──→  │  KK-LRMS API     │
│  (ANC module)│     POST /api/webhooks/  │  Pregnancy        │
│              │     patient-data         │  registry updated │
└──────────────┘                          └──────────────────┘
```

1. On ANC registration: send patient with pregnancy info
2. On each ANC visit: send patient with new visit in `visits` array
3. On risk change: send updated `riskLevel`

### Error Handling

- **Retry on 500**: Transient. Retry with exponential backoff (1s, 2s, 4s, max 60s).
- **Do not retry on 400**: Fix the payload.
- **Do not retry on 401**: Check API key.
- **Do not retry on 403**: hospitalCode doesn't match API key.
- **Idempotent**: Sending the same data multiple times is safe (upsert by compound key).

---

## Data Privacy (PDPA Compliance)

| Data Field      | Storage Method                                    |
|----------------|---------------------------------------------------|
| Patient name   | AES-256-GCM encrypted at rest                     |
| CID (national ID) | AES-256-GCM encrypted + SHA-256 hash for matching |
| Clinical data  | Stored in plaintext (not personally identifiable)  |
| API key        | SHA-256 hash only (raw key never stored)           |

All data transmitted over HTTPS/TLS.

---

## Rate Limits

| Constraint              | Limit                |
|------------------------|----------------------|
| Patients per request   | 100 maximum (labor)  |
| Request payload size   | 1 MB                 |
| Recommended interval   | ≥ 5 minutes          |

---

## Changelog

| Version | Date       | Changes |
|---------|------------|---------|
| 2.0     | 2026-03-31 | Add ANC data webhook (`type: "anc_data"`), referral update webhook (`type: "referral_update"`), delete operations (`action: "delete"`) for all types, `hospitalCode` validation, SSE event types for journey/referral/newborn |
| 1.0     | 2026-03-19 | Initial release: incremental + full_snapshot modes, API key auth, CPD scoring, transfer detection |
