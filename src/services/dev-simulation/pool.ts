// Province-wide patient registry + per-hospital admission / referral pools.
//
// Goal: let the simulator thread realistic continuations that a real provincial
// system would see — the SAME CID moves ANC → Labor (possibly at a different
// hospital after a referral), the SAME AN accumulates partograph observations,
// the SAME referralId walks INITIATED → ACCEPTED → IN_TRANSIT → ARRIVED, and
// an ARRIVED referral at hospital Y can turn into a labor admission at Y for
// the same CID that registered ANC at hospital X.
//
// Before this refactor the patient pool was per-hospital, so cross-hospital
// continuity was architecturally impossible. Now:
//   * `patientsByCid` is a PROVINCE-LEVEL Map<cid, PooledPatient> — mother
//     records follow the person, not the hospital.
//   * Admissions and referrals stay keyed per hospital (they're hospital-
//     local by nature — an AN only exists at the hospital that issued it).
//
// Survives HMR in dev via `global` attachment.

export interface PooledPatient {
  cid: string;
  hn: string;
  name: string;
  birthday: string;      // ISO date (YYYY-MM-DD)
  pregNo: number;        // stable across the pregnancy — prevents duplicate journeys
  lmp: string;           // ISO date — stable per pregnancy
  edc: string;           // ISO date — stable per pregnancy
  ga: number;            // latest known gestational age in weeks
  ancVisits: number;
  stage: 'ANC' | 'LABOR';
  homeHcode: string;     // where this patient first appeared (usually ANC hospital)
  currentHcode: string;  // most recent hospital that touched this patient
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
  /** Who is being referred — ties the referral to a real patient. */
  cid: string;
  hn: string;
  name: string;
  createdAt: number;
  status: 'INITIATED' | 'ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'REJECTED';
}

interface HospitalLocalPool {
  admissions: PooledAdmission[]; // Currently-admitted labor patients at this hospital
  referrals: PooledReferral[];   // Referrals initiated FROM this hospital
}

const MAX_ADMISSIONS_PER_HOSPITAL = 20;
const MAX_REFERRALS_PER_HOSPITAL = 20;
const MAX_PATIENTS_PROVINCE = 500; // keeps memory bounded across a long sim

// ─── HMR-safe global attachment ────────────────────────────────────────────

const globalAny = global as unknown as {
  __simPoolV2?: {
    patientsByCid: Map<string, PooledPatient>;
    hospitalPool: Map<string, HospitalLocalPool>;
  };
};
if (!globalAny.__simPoolV2) {
  globalAny.__simPoolV2 = {
    patientsByCid: new Map<string, PooledPatient>(),
    hospitalPool: new Map<string, HospitalLocalPool>(),
  };
}
const patientsByCid = globalAny.__simPoolV2.patientsByCid;
const hospitalPool = globalAny.__simPoolV2.hospitalPool;

function ensureHosp(hcode: string): HospitalLocalPool {
  let h = hospitalPool.get(hcode);
  if (!h) {
    h = { admissions: [], referrals: [] };
    hospitalPool.set(hcode, h);
  }
  return h;
}

function trimArray<T>(arr: T[], cap: number): void {
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

function trimPatientMap(): void {
  if (patientsByCid.size <= MAX_PATIENTS_PROVINCE) return;
  // Evict oldest createdAt. Simple O(n log n) for dev-only code.
  const entries = [...patientsByCid.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const drop = entries.slice(0, entries.length - MAX_PATIENTS_PROVINCE);
  for (const [cid] of drop) patientsByCid.delete(cid);
}

// ─── Patients (province-wide, keyed by CID) ───────────────────────────────

export function addPatient(hcode: string, p: PooledPatient): void {
  // New patients pin their home hospital; existing ones get their current
  // hospital pointer bumped.
  const existing = patientsByCid.get(p.cid);
  if (existing) {
    existing.hn = p.hn;
    existing.name = p.name;
    existing.pregNo = p.pregNo;
    existing.lmp = p.lmp;
    existing.edc = p.edc;
    existing.ga = p.ga;
    existing.ancVisits = p.ancVisits;
    existing.stage = p.stage;
    existing.currentHcode = hcode;
    return;
  }
  patientsByCid.set(p.cid, {
    ...p,
    homeHcode: p.homeHcode || hcode,
    currentHcode: hcode,
  });
  trimPatientMap();
}

/** Returns any ANC-stage patient anywhere in the province, with a weighted
 *  preference for the requested hospital. Returning a cross-hospital match
 *  is how we model real mothers who move between hospitals for their care.
 *  When preferHcode is null or undefined, searches the whole province. */
export function findAncPatient(
  preferHcode?: string | null,
  crossHospitalProbability = 0.2,
): PooledPatient | null {
  const all = [...patientsByCid.values()].filter((p) => p.stage === 'ANC');
  if (all.length === 0) return null;
  const sameHosp = preferHcode ? all.filter((p) => p.currentHcode === preferHcode) : [];
  const otherHosp = preferHcode ? all.filter((p) => p.currentHcode !== preferHcode) : all;
  const useCrossHospital =
    sameHosp.length === 0 ||
    (otherHosp.length > 0 && Math.random() < crossHospitalProbability);
  const candidates = useCrossHospital && otherHosp.length > 0 ? otherHosp : sameHosp.length > 0 ? sameHosp : all;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Back-compat alias — still supports legacy callers that only asked for
 *  same-hospital ANC. Now drives `findAncPatient` under the hood with a small
 *  cross-hospital chance so the simulator reflects real patient migration. */
export function findExistingAncPatient(hcode: string): PooledPatient | null {
  return findAncPatient(hcode);
}

/** Graduates a patient to LABOR stage at the given hospital. Patient may have
 *  originated at a different hospital (cross-hospital migration). */
export function graduateToLabor(hcode: string, cid: string): PooledPatient | null {
  const p = patientsByCid.get(cid);
  if (!p) return null;
  p.stage = 'LABOR';
  p.currentHcode = hcode;
  return p;
}

// ─── Admissions (partograph continuation) ─────────────────────────────────

export function addAdmission(hcode: string, a: PooledAdmission): void {
  const h = ensureHosp(hcode);
  h.admissions.push(a);
  trimArray(h.admissions, MAX_ADMISSIONS_PER_HOSPITAL);
}

export function pickRecentAdmission(hcode: string): PooledAdmission | null {
  const h = hospitalPool.get(hcode);
  if (!h || h.admissions.length === 0) return null;
  const now = Date.now();
  const recent = h.admissions.filter((a) => now - a.admittedAt < 4 * 3600_000);
  const pickFrom = recent.length ? recent : h.admissions;
  let minHours = Infinity;
  for (const a of pickFrom) if (a.partographHours < minHours) minHours = a.partographHours;
  const tied = pickFrom.filter((a) => a.partographHours === minHours);
  return tied[Math.floor(Math.random() * tied.length)];
}

export function incPartographHour(hcode: string, an: string): number {
  const h = hospitalPool.get(hcode);
  if (!h) return 1;
  const a = h.admissions.find((x) => x.an === an);
  if (!a) return 1;
  a.partographHours += 1;
  return a.partographHours;
}

// ─── Referrals ────────────────────────────────────────────────────────────

export function addReferral(hcode: string, r: PooledReferral): void {
  const h = ensureHosp(hcode);
  h.referrals.push(r);
  trimArray(h.referrals, MAX_REFERRALS_PER_HOSPITAL);
}

export function pickRecentReferralForUpdate(toHcode: string): PooledReferral | null {
  const candidates: PooledReferral[] = [];
  for (const [, h] of hospitalPool.entries()) {
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

/** Picks a recent ARRIVED referral whose destination is `toHcode`. Used by
 *  labor generation so a patient who arrives after referral actually gets
 *  admitted under the same CID — closes the cross-hospital journey loop.
 *  The picked referral is consumed (marked DONE) so labor doesn't re-hit. */
export function consumeArrivedReferralForAdmission(toHcode: string): PooledReferral | null {
  let hit: PooledReferral | null = null;
  for (const [, h] of hospitalPool.entries()) {
    for (const r of h.referrals) {
      if (
        r.toHcode === toHcode &&
        r.status === 'ARRIVED' &&
        Date.now() - r.createdAt < 6 * 3600_000
      ) {
        hit = r;
        break;
      }
    }
    if (hit) break;
  }
  if (hit) hit.status = 'REJECTED'; // "already admitted" sentinel — prevents double-use
  return hit;
}

/** Picks an existing patient from hospital X to refer out. Prefers current
 *  admissions (someone in labor) but falls back to an ANC-registered mother
 *  if no admissions exist. Returns null when nothing in pool — caller then
 *  falls back to a synthetic CID. */
export function pickPatientToRefer(fromHcode: string): {
  cid: string;
  hn: string;
  name: string;
} | null {
  const h = hospitalPool.get(fromHcode);
  // Prefer an admission — reflects "hospital transferring an admitted patient out"
  if (h && h.admissions.length > 0) {
    const a = h.admissions[Math.floor(Math.random() * h.admissions.length)];
    return { cid: a.cid, hn: a.hn, name: a.name };
  }
  // Fall back to ANC patient at this hospital
  const ancHere = [...patientsByCid.values()].filter(
    (p) => p.stage === 'ANC' && p.currentHcode === fromHcode,
  );
  if (ancHere.length > 0) {
    const p = ancHere[Math.floor(Math.random() * ancHere.length)];
    return { cid: p.cid, hn: p.hn, name: p.name };
  }
  return null;
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

// ─── Reset (used on simulation stop) ──────────────────────────────────────

export function resetPool(): void {
  patientsByCid.clear();
  hospitalPool.clear();
}

// ─── Inspector (dev-only) ─────────────────────────────────────────────────

export function debugPoolSnapshot() {
  return {
    totalPatients: patientsByCid.size,
    byStage: {
      anc: [...patientsByCid.values()].filter((p) => p.stage === 'ANC').length,
      labor: [...patientsByCid.values()].filter((p) => p.stage === 'LABOR').length,
    },
    crossHospitalPatients: [...patientsByCid.values()].filter(
      (p) => p.homeHcode !== p.currentHcode,
    ).length,
    hospitalAdmissions: [...hospitalPool.entries()].map(([hcode, p]) => ({
      hcode,
      admissions: p.admissions.length,
      referrals: p.referrals.length,
    })),
  };
}
