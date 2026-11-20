// Push actor resolution — the CREDENTIAL side of a sync push.
//
// A sync push writes hospital data into the central cache, so the hospital
// must come from the caller's credential and never from the request body:
//   * a browser tab  → NextAuth session (hospitalCode from the session)
//   * the headless agent → API key (webhook_api_keys row, hospital-scoped)
//
// Both paths run the same three gates: the hospital must exist, be active,
// and must not be in the "purged, awaiting re-onboard" state — a push must
// not put back data an administrator deleted.
import type { DatabaseAdapter } from '@/db/adapter';
import { validateApiKey } from '@/services/webhook';
import type { PushActor } from '@/services/sync/push-handler';

export type ActorResolution =
  | { ok: true; actor: PushActor }
  | { ok: false; error: string; status: number };

/** Read the bearer token out of the Authorization header. */
export function readBearer(request: { headers: { get(name: string): string | null } }): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const raw = match ? match[1] : header.trim();
  return raw.length > 0 ? raw : null;
}

/** The three gates every push shares. Returns an error shape on refusal. */
async function gateHospital(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<ActorResolution | null> {
  const purged = await db.query<{ data_purged_at: string | null }>(
    'SELECT data_purged_at FROM hospital_bms_config WHERE hospital_id = ?',
    [hospitalId],
  );
  if (purged[0]?.data_purged_at) {
    return {
      ok: false,
      error: 'hospital_purged_pending_reonboard',
      status: 403,
    };
  }
  return null;
}

interface SessionUser {
  hospitalCode?: string | null;
  accessMode?: string | null;
}

/**
 * Browser path. `allowReadonly` is true for the bootstrap GET (a readonly
 * viewer may read the newborn cutoff — it carries no patient identifiers)
 * and false for the push itself.
 */
export async function resolveSessionActor(
  db: DatabaseAdapter,
  user: SessionUser,
  opts: { allowReadonly?: boolean } = {},
): Promise<ActorResolution> {
  if (!opts.allowReadonly && user.accessMode === 'readonly') {
    return { ok: false, error: 'readonly_session_cannot_push', status: 403 };
  }
  const hcode = user.hospitalCode ?? null;
  if (!hcode) {
    return { ok: false, error: 'no_hospital_code_in_session', status: 400 };
  }
  const rows = await db.query<{ id: string; is_active: boolean | number }>(
    'SELECT id, is_active FROM hospitals WHERE hcode = ?',
    [hcode],
  );
  if (rows.length === 0) {
    return { ok: false, error: 'hospital_not_registered', status: 403 };
  }
  if (rows[0].is_active !== true && rows[0].is_active !== 1) {
    return { ok: false, error: 'hospital_inactive', status: 403 };
  }
  const purgeRefusal = await gateHospital(db, rows[0].id);
  if (purgeRefusal) return purgeRefusal;

  return {
    ok: true,
    actor: {
      hospitalId: rows[0].id,
      hcode,
      trigger: 'browser',
      accessMode: user.accessMode === 'readonly' ? 'readonly' : 'write',
      // A browser session carries no API-key capabilities.
      scopes: [],
    },
  };
}

/**
 * Agent path. The API key is hospital-scoped (webhook_api_keys.hospital_id),
 * so a key can only ever write to its own hospital.
 *
 * `requireScope` is the capability check: the key must carry the scope the
 * endpoint needs (agent:push / agent:heartbeat / agent:authenticity). The
 * scopes are written when the key is minted (see the admin agent-key
 * endpoint) and are NOT the label — the label is free text. An ordinary
 * HOSxP webhook key therefore cannot drive the agent endpoints, and an
 * agent:push key cannot drive the destructive authenticity verdict.
 */
export async function resolveApiKeyActor(
  db: DatabaseAdapter,
  rawKey: string,
  opts: { requireScope: string },
): Promise<ActorResolution> {
  const keyInfo = await validateApiKey(db, rawKey);
  if (!keyInfo) {
    return { ok: false, error: 'invalid_api_key', status: 401 };
  }
  // Fail closed: a key without the capability this endpoint needs is
  // refused, whatever else it may be allowed to do.
  if (!keyInfo.scopes.includes(opts.requireScope)) {
    return { ok: false, error: 'api_key_missing_scope', status: 403 };
  }
  const rows = await db.query<{ id: string; hcode: string; is_active: boolean | number }>(
    'SELECT id, hcode, is_active FROM hospitals WHERE id = ?',
    [keyInfo.hospitalId],
  );
  if (rows.length === 0) {
    return { ok: false, error: 'hospital_not_registered', status: 403 };
  }
  if (rows[0].is_active !== true && rows[0].is_active !== 1) {
    return { ok: false, error: 'hospital_inactive', status: 403 };
  }
  const purgeRefusal = await gateHospital(db, rows[0].id);
  if (purgeRefusal) return purgeRefusal;

  return {
    ok: true,
    actor: {
      hospitalId: rows[0].id,
      hcode: rows[0].hcode,
      trigger: 'agent',
      accessMode: 'write',
      scopes: keyInfo.scopes,
    },
  };
}
