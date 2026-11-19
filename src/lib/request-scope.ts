// The signed-in viewer's patient-visibility scope, resolved per request.
//
// The scope is read from the database on every request — never cached in the
// JWT — so an admin changing a hospital's scope or the node tree takes effect
// on the next request, not at the next login.
//
// Node-side (imports @/lib/auth) — never import from src/middleware.ts.
import type { DatabaseAdapter } from '@/db/adapter';
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import {
  resolveViewerScope,
  scopeAllowsHcode,
  scopeAllowsPatientRow,
  type ViewerScope,
} from '@/services/visibility-scope';

export interface RequestScope {
  db: DatabaseAdapter;
  /** Which hospitals' patient rows this session may read. */
  scope: ViewerScope;
  session: Session | null;
  /** The hospital the session belongs to (null when it has none). */
  hospitalCode: string | null;
}

export async function resolveRequestScope(): Promise<RequestScope> {
  const session = await auth();
  const db = await getDatabase();
  const hospitalCode = session?.user ? session.user.hospitalCode : null;
  const scope = await resolveViewerScope(db, hospitalCode);
  return { db, scope, session, hospitalCode };
}

/**
 * The scope of an already-authenticated session. Routes that use
 * requireSession() resolve the scope with this, so the session is read once.
 */
export async function scopeForSession(
  db: DatabaseAdapter,
  session: Session,
): Promise<ViewerScope> {
  const hospitalCode = session?.user ? session.user.hospitalCode : null;
  return resolveViewerScope(db, hospitalCode);
}

const HOSPITAL_SCOPE_DENIED_BODY = {
  error: 'Forbidden',
  code: 'HOSPITAL_SCOPE_DENIED',
  message: 'คุณไม่มีสิทธิ์ดูข้อมูลคนไข้ของโรงพยาบาลนี้',
  suggestedAction:
    'ดูได้เฉพาะข้อมูลของโรงพยาบาลของคุณ รวมถึงคนไข้ที่โรงพยาบาลอื่นส่งต่อเข้ามา',
};

/**
 * The viewer's own hospital is not in the registry.
 *
 * Without this the answer was "คุณไม่มีสิทธิ์ดูข้อมูลคนไข้ของโรงพยาบาลนี้" —
 * a permission problem — for a hospital asking about ITSELF. The truth is
 * that the hospital has never been registered, so nothing has been synced
 * and there are no numbers to show yet.
 */
const HOSPITAL_NOT_REGISTERED_BODY = {
  error: 'Forbidden',
  code: 'HOSPITAL_NOT_REGISTERED',
  message: 'โรงพยาบาลของคุณยังไม่ได้ลงทะเบียนกับระบบ จึงยังไม่มีข้อมูลคนไข้ให้แสดง',
  suggestedAction:
    'เปิดหน้าห้องคลอดของโรงพยาบาลเพื่อให้ระบบซิงก์ข้อมูลครั้งแรก แล้วกลับมาเปิดหน้านี้อีกครั้ง',
};

/**
 * Guard for the routes that take a hospital code (or a patient id that
 * carries one) in the URL. Returns the 403 response when the hospital is out
 * of the viewer's scope, or null when the request may proceed.
 */
export async function denyIfHospitalOutOfScope(
  db: DatabaseAdapter,
  scope: ViewerScope,
  hcode: string,
): Promise<NextResponse | null> {
  if (await scopeAllowsHcode(db, scope, hcode)) return null;
  // The viewer belongs to no registered hospital: the answer must say THAT,
  // not "you may not read this hospital" — a hospital asking about its own
  // console was told it had no permission to look at itself.
  if (scope.mode === 'SCOPED' && scope.allowedHospitalIds.length === 0) {
    return NextResponse.json(HOSPITAL_NOT_REGISTERED_BODY, { status: 403 });
  }
  return NextResponse.json(HOSPITAL_SCOPE_DENIED_BODY, { status: 403 });
}

/**
 * Guard for the patient routes. The reader may read the row when the hospital
 * that holds it is in scope, or when the patient was referred in to the
 * reader's hospital — that one patient is the whole grant.
 */
export async function denyIfPatientOutOfScope(
  db: DatabaseAdapter,
  scope: ViewerScope,
  hospitalId: string | null | undefined,
  journeyId: string | null | undefined,
): Promise<NextResponse | null> {
  if (await scopeAllowsPatientRow(db, scope, hospitalId, journeyId)) return null;
  return NextResponse.json(HOSPITAL_SCOPE_DENIED_BODY, { status: 403 });
}
