# KK-LRMS — Khon Kaen Labor Room Monitoring System

ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดขอนแก่น

Real-time centralized labor room monitoring dashboard for Khon Kaen province obstetricians, covering 26+ community hospitals across Health Region 7.

## What It Does

KK-LRMS enables obstetricians and labor room nurses at **Khon Kaen Hospital** (hub) to monitor all labor patients across **26 community hospitals** (spokes) in real-time — from a single dashboard.

- **Auto-pulls data** from HOSxP HIS systems every 30 seconds via BMS Session API
- **Calculates CPD Risk Score** from 8 clinical factors (gravida, GA, height, U/S weight, etc.)
- **Color-coded risk levels** — green (low), yellow (medium), red (high ≥10: recommend referral)
- **Digital partogram** — cervix dilation progress with alert/action lines
- **Vital sign monitoring** — HR, FHR, BP, PPH with trend charts and gauges
- **Cross-hospital transfer detection** — tracks patients moving between hospitals via CID hash
- **Webhook API** — non-HOSxP hospitals can push data via authenticated REST API
- **Kiosk mode** — fullscreen dark-themed display for dedicated wall monitors
- **PDPA compliant** — patient name and CID encrypted with AES-256-GCM

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript 5.x |
| Styling | Tailwind CSS 4, shadcn/ui |
| Auth | NextAuth.js v5 (BMS Session + JWT) |
| Database | PostgreSQL 16+ (production), pglite in-memory — embedded Postgres (tests) |
| Real-time | Server-side polling (30s) → SSE broadcast → SWR client |
| Charts | Recharts (partogram, vital signs, risk distribution) |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Deployment | Docker (multi-stage build), Node.js 20 LTS |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)
- Git

### 1. Clone and Install

```bash
git clone https://github.com/manoi-bms/kk-lrms.git
cd kk-lrms
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Required
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Database (skip if using pglite dev mode)
DATABASE_URL="postgresql://kklrms:<password>@localhost:5432/kklrms"
POSTGRES_PASSWORD="<strong-password>"

# BMS Authentication
BMS_VALIDATE_URL="https://hosxp.net/phapi/PasteJSON"
DEV_HOSPITAL_TUNNEL_URL="<your-tunnel-url>"

# Development shortcuts
DEV_AUTH_BYPASS="true"    # Accept any session ID as admin
USE_PGLITE="true"         # Use embedded Postgres (pglite) instead of a PostgreSQL server
```

### 3. Run Development Server

**Option A: pglite mode (no Docker needed)**

```bash
# Set USE_PGLITE=true in .env.local, then:
npm run dev
```

**Option B: PostgreSQL via Docker**

```bash
docker compose up db -d     # Start PostgreSQL
npm run dev                  # Start Next.js
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Docker Production Build

```bash
docker compose up --build
```

The app will be available at port 3000 with PostgreSQL on 5432.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/login/       # Login page (BMS Session auth)
│   ├── (dashboard)/        # Protected pages (dashboard, hospitals, patients)
│   ├── about/              # Public about page with API docs
│   ├── api/                # API routes
│   │   ├── auth/           # NextAuth handlers
│   │   ├── dashboard/      # Dashboard data + high-risk patients
│   │   ├── hospitals/      # Hospital patient lists
│   │   ├── patients/       # Patient detail, vitals, partogram, contractions
│   │   ├── webhooks/       # Webhook data ingestion
│   │   ├── admin/          # Hospital config + webhook key management
│   │   ├── sse/            # Server-Sent Events stream
│   │   └── health/         # Health check endpoint
│   └── globals.css         # Global styles + kiosk mode CSS
├── components/             # Reusable UI components
│   ├── ui/                 # shadcn/ui base (Button, Card, Table, etc.)
│   ├── dashboard/          # HospitalTable, SummaryCards, KioskHeader, etc.
│   ├── patient/            # PatientHeader, ClinicalData, PrintForm, etc.
│   ├── charts/             # PartogramChart, VitalSignGauge, BpBarChart
│   ├── shared/             # CpdBadge, RiskIndicator, ConnectionStatus, etc.
│   └── layout/             # Sidebar, TopBar, BreadcrumbContext
├── services/               # Centralized business logic
│   ├── cpd-score.ts        # CPD risk calculation (8 factors)
│   ├── sync.ts             # HOSxP polling + data sync pipeline
│   ├── webhook.ts          # Webhook API key management + processing
│   ├── partogram.ts        # Alert/action line computation
│   ├── dashboard.ts        # Dashboard aggregation queries
│   └── audit.ts            # PDPA audit logging
├── db/                     # Database abstraction layer
│   ├── adapter.ts          # Abstract DatabaseAdapter interface
│   ├── pglite-adapter.ts   # Embedded Postgres via pglite (development + tests)
│   ├── postgres-adapter.ts # PostgreSQL (production)
│   ├── schema-sync.ts      # Auto-migrate tables from definitions
│   ├── tables/             # Table definitions (8 tables)
│   └── seeds/              # Hospital seeder (26 hospitals) + demo data
├── lib/                    # Shared utilities
│   ├── auth.ts             # NextAuth.js configuration
│   ├── bms-session.ts      # BMS Session API client
│   ├── encryption.ts       # AES-256-GCM (PDPA compliance)
│   ├── sse.ts              # SSE event broadcast manager
│   └── utils.ts            # Date formatting, Thai locale helpers
├── hooks/                  # React hooks (SWR data fetching)
├── types/                  # TypeScript definitions (domain, API, HOSxP, BMS)
└── config/                 # Risk levels, hospital levels, SQL templates
```

## Testing

```bash
# Run all unit + integration tests (463 tests, 48 files)
npm test

# Watch mode
npm run test:watch

# E2E tests (requires running server)
npm run test:e2e
```

### Test Coverage

| Category | Files | Tests |
|----------|-------|-------|
| Unit — Services | 8 | CPD score, sync, webhook, partogram, dashboard, audit, health |
| Unit — Components | 19 | All dashboard, patient, chart, and shared components |
| Unit — API Routes | 8 | Dashboard, patient, vitals, hospitals, admin, health |
| Unit — Database | 5 | pglite adapter, schema sync, test harness, seeds |
| Unit — Libraries | 5 | Auth, BMS session, encryption, SSE, utils |
| Unit — Pages | 2 | Login, error pages |
| Integration | 3 | Full flow, sync pipeline, webhook pipeline |
| E2E | 2 | Dashboard flow, admin flow |
| **Total** | **50** | **463 tests** |

## Key Features

### Province Dashboard

Real-time overview of all 26 hospitals with patient counts grouped by CPD risk level. Updates every 30 seconds via SSE. Supports kiosk mode for dedicated monitors.

### CPD Risk Score

Automatic calculation from 8 clinical factors:

| Factor | High-risk threshold | Max score |
|--------|-------------------|-----------|
| Gravida | Primigravida (= 1) | 2.0 |
| ANC visits | < 4 visits | 1.5 |
| Gestational age | ≥ 40 weeks | 1.5 |
| Maternal height | < 150 cm | 2.0 |
| Weight gain | > 20 kg | 2.0 |
| Fundal height | > 36 cm | 2.0 |
| U/S fetal weight | > 3,500 g | 2.0 |
| Hematocrit | < 30% | 1.5 |

**Risk levels:** LOW (0-4.99, green) · MEDIUM (5-9.99, yellow) · HIGH (≥10, red → recommend referral)

### Webhook API

REST API for non-HOSxP hospitals to push patient data. Two ingestion modes:

- **`incremental`** (default) — add/update only sent patients
- **`full_snapshot`** — auto-discharge patients missing from payload

See [docs/WEBHOOK-SPEC.md](docs/WEBHOOK-SPEC.md) for full API documentation with code samples.

```bash
curl -X POST https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kklrms_your_api_key" \
  -d '{"mode":"full_snapshot","patients":[{"hn":"HN-001","an":"AN-001","name":"...","age":28,"admit_date":"2026-03-19T08:00:00+07:00"}]}'
```

### Auto-Login via URL

Supports SSO-style login from BMS:

```
https://kk-lrms.bmscloud.in.th/?bms-session-id=YOUR-SESSION-ID
```

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/about` | System overview and API documentation |
| GET | `/api/health` | Health check (status, DB, uptime, connections) |
| POST | `/api/webhooks/patient-data` | Webhook data ingestion (API key auth) |

### Protected (requires login)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Province dashboard data (all hospitals + risk counts) |
| GET | `/api/dashboard/high-risk` | High-risk patient list |
| GET | `/api/hospitals/[hcode]/patients` | Patient list for a hospital (filterable, paginated) |
| GET | `/api/patients/[an]` | Patient detail with CPD score |
| GET | `/api/patients/[an]/vitals` | Vital sign time series |
| GET | `/api/patients/[an]/partogram` | Partogram data with alert/action lines |
| GET | `/api/patients/[an]/contractions` | Contraction monitoring data |
| GET | `/api/sse/dashboard` | SSE stream for real-time updates |

### Admin (requires ADMIN role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/hospitals` | List hospitals with BMS config |
| PUT | `/api/admin/hospitals/[hcode]/bms-config` | Configure BMS tunnel URL |
| POST | `/api/admin/hospitals/[hcode]/test-connection` | Test HOSxP connection |
| GET | `/api/admin/webhooks` | List webhook API keys |
| POST | `/api/admin/webhooks` | Create API key for a hospital |
| DELETE | `/api/admin/webhooks/[keyId]` | Revoke API key |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes | NextAuth.js session encryption key |
| `ENCRYPTION_KEY` | Yes | AES-256 hex key for PDPA encryption (64 hex chars) |
| `DATABASE_URL` | Prod | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Prod | PostgreSQL password (used by docker-compose) |
| `NEXTAUTH_URL` | Prod | Public URL (e.g., `https://kk-lrms.bmscloud.in.th`) |
| `BMS_VALIDATE_URL` | Prod | BMS session validation endpoint |
| `DEV_HOSPITAL_TUNNEL_URL` | Dev | HOSxP tunnel URL for development |
| `DEV_AUTH_BYPASS` | Dev | Set `true` to skip BMS auth (any session ID → admin) |
| `USE_PGLITE` | Dev | Set `true` to use embedded Postgres (pglite) instead of a server |

## Documentation

| File | Description |
|------|-------------|
| [docs/WEBHOOK-SPEC.md](docs/WEBHOOK-SPEC.md) | Webhook API specification with SQL, Python, Node.js examples |
| [docs/BMS-SESSION-FOR-DEV.md](docs/BMS-SESSION-FOR-DEV.md) | BMS Session API development guide |
| [specs/001-kk-lrms-app/spec.md](specs/001-kk-lrms-app/spec.md) | Feature specification (8 user stories, 28 FRs) |
| [specs/001-kk-lrms-app/plan.md](specs/001-kk-lrms-app/plan.md) | Implementation plan and architecture |
| [specs/001-kk-lrms-app/tasks.md](specs/001-kk-lrms-app/tasks.md) | Task breakdown (124 tasks, all complete) |

## Security & PDPA Compliance

- Patient name and CID encrypted at rest (AES-256-GCM)
- CID hashed with SHA-256 for cross-hospital matching (never stored in plaintext)
- API keys stored as SHA-256 hashes
- All patient data access logged in audit trail
- Role-based access control (Obstetrician, Nurse, Admin)
- Security headers: HSTS, X-Frame-Options, CSP, X-Content-Type-Options
- HTTPS/TLS required in production
- Patient names never displayed on dashboard UI (HN/AN only)

## License

Private — สำนักงานสาธารณสุขจังหวัดขอนแก่น (Khon Kaen Provincial Health Office)
