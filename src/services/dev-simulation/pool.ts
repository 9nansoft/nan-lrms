// Per-hospital in-memory pool — lets the simulator thread realistic
// continuations: the same CID moves ANC → Labor, the same AN receives
// follow-up partograph observations, the same referralId gets status
// updates. Survives HMR in dev via `global` attachment.

export interface PooledPatient {
  cid: string;
  hn: string;
  name: string;
  ga: number;
  ancVisits: number;
  stage: 'ANC' | 'LABOR';
  createdAt: number;
}

export interface PooledAdmission {
  an: string;
  hn: string;
  cid: string;
  name: string;
  admittedAt: number;
  /** Tick counter used as partograph hour-no fallback. */
  partographHours: number;
}

export interface PooledReferral {
  referralId: string;
  fromHcode: string;
  toHcode: string;
  createdAt: number;
  status: 'INITIATED' | 'ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'REJECTED';
}

interface HospitalPool {
  patients: PooledPatient[];     // ANC-registered women at this hospital
  admissions: PooledAdmission[]; // Currently-admitted labor patients
  referrals: PooledReferral[];   // Referrals initiated FROM this hospital
}

const MAX_POOL_PER_HOSPITAL = 20;

const globalAny = global as unknown as {
  __simPool?: Map<string, HospitalPool>;
};
const pool: Map<string, HospitalPool> = globalAny.__simPool ?? new Map();
if (!globalAny.__simPool) globalAny.__simPool = pool;

function ensure(hcode: string): HospitalPool {
  let h = pool.get(hcode);
  if (!h) {
    h = { patients: [], admissions: [], referrals: [] };
    pool.set(hcode, h);
  }
  return h;
}

function trim<T>(arr: T[]): void {
  if (arr.length > MAX_POOL_PER_HOSPITAL) {
    arr.splice(0, arr.length - MAX_POOL_PER_HOSPITAL);
  }
}

// ─── Patients (ANC / Labor continuation) ──────────────────────────────

export function addPatient(hcode: string, p: PooledPatient): void {
  const h = ensure(hcode);
  h.patients.push(p);
  trim(h.patients);
}

export function findExistingAncPatient(hcode: string): PooledPatient | null {
  const h = pool.get(hcode);
  if (!h) return null;
  const candidates = h.patients.filter((p) => p.stage === 'ANC');
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

/** Graduates an ANC-pool patient to LABOR stage. Returns the mutated entry. */
export function graduateToLabor(hcode: string, cid: string): PooledPatient | null {
  const h = pool.get(hcode);
  if (!h) return null;
  const p = h.patients.find((x) => x.cid === cid);
  if (!p) return null;
  p.stage = 'LABOR';
  return p;
}

// ─── Admissions (partograph continuation) ─────────────────────────────

export function addAdmission(hcode: string, a: PooledAdmission): void {
  const h = ensure(hcode);
  h.admissions.push(a);
  trim(h.admissions);
}

export function pickRecentAdmission(hcode: string): PooledAdmission | null {
  const h = pool.get(hcode);
  if (!h || h.admissions.length === 0) return null;
  // Prefer recently admitted (within last 2h) — partograph is a time series
  const now = Date.now();
  const recent = h.admissions.filter((a) => now - a.admittedAt < 4 * 3600_000);
  const pickFrom = recent.length ? recent : h.admissions;
  return pickFrom[Math.floor(Math.random() * pickFrom.length)];
}

/** Increments the partograph hour counter and returns the new value. */
export function incPartographHour(hcode: string, an: string): number {
  const h = pool.get(hcode);
  if (!h) return 1;
  const a = h.admissions.find((x) => x.an === an);
  if (!a) return 1;
  a.partographHours += 1;
  return a.partographHours;
}

// ─── Referrals (referral-update continuation) ─────────────────────────

export function addReferral(hcode: string, r: PooledReferral): void {
  const h = ensure(hcode);
  h.referrals.push(r);
  trim(h.referrals);
}

export function pickRecentReferralForUpdate(toHcode: string): PooledReferral | null {
  // Updates come from the RECEIVING hospital, so we search all hospitals'
  // referrals that target toHcode.
  const candidates: PooledReferral[] = [];
  for (const [, h] of pool.entries()) {
    for (const r of h.referrals) {
      if (
        r.toHcode === toHcode &&
        r.status !== 'ARRIVED' &&
        r.status !== 'REJECTED' &&
        Date.now() - r.createdAt < 2 * 3600_000
      ) {
        candidates.push(r);
      }
    }
  }
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

export function advanceReferralStatus(ref: PooledReferral): PooledReferral['status'] {
  switch (ref.status) {
    case 'INITIATED':
      ref.status = Math.random() < 0.2 ? 'REJECTED' : 'ACCEPTED';
      break;
    case 'ACCEPTED':
      ref.status = 'IN_TRANSIT';
      break;
    case 'IN_TRANSIT':
      ref.status = 'ARRIVED';
      break;
    default:
      break;
  }
  return ref.status;
}

// ─── Reset (used on simulation stop) ──────────────────────────────────

export function resetPool(): void {
  pool.clear();
}
