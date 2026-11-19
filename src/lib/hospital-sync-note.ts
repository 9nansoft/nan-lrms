// Why a hospital shows no rows.
//
// An empty table says "no patients" — but the same table is what a hospital
// that never synced looks like, and what a hospital whose data was erased
// looks like. The ward staff cannot act on that: the fix is completely
// different in each case. This is the note that says WHICH.
//
// The wording is Thai on purpose: it goes straight to the screen of the
// person who has to fix it (constitution V — error messages must say what
// went wrong AND what to do).

export interface HospitalSyncState {
  /** The hospital is switched off in the admin board. */
  isActive?: boolean | null;
  /** The admin erased this hospital's data (PDPA) — it is suspended until
   *  the hospital is re-onboarded. */
  dataPurgedAt?: string | null;
  /** When the hospital last synced. Null = it never synced. */
  lastSyncAt?: string | null;
}

/**
 * The note for an empty hospital view, or null when the emptiness is a
 * plain fact about the ward (no admission right now).
 */
export function hospitalSyncNote(state: HospitalSyncState | undefined): string | null {
  if (!state) return null;
  if (state.dataPurgedAt) {
    return 'โรงพยาบาลนี้ถูกลบข้อมูลตามคำขอ — ข้อมูลจะกลับมาเมื่อผู้ดูแลระบบเปิดใช้งานซิงก์อีกครั้ง (หน้า /admin)';
  }
  if (state.isActive === false) {
    return 'โรงพยาบาลนี้ถูกปิดการใช้งานอยู่ — เปิดใช้งานที่หน้า /admin เพื่อให้ระบบซิงก์ข้อมูลกลับมา';
  }
  if (!state.lastSyncAt) {
    return 'โรงพยาบาลนี้ยังไม่เคยซิงก์ข้อมูลจาก HOSxP — เปิดหน้าห้องคลอดของโรงพยาบาลแล้วรอสักครู่ ระบบจะดึงข้อมูลมาให้เอง';
  }
  return null;
}
