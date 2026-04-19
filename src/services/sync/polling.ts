// Polling orchestration — scheduler, sync lock, JWT refresh, immediate sync
import { createHash } from 'crypto';
import type { DatabaseAdapter } from '@/db/adapter';
import { BmsSessionClient } from '@/lib/bms-session';
import { SseManager } from '@/lib/sse';
import { encrypt } from '@/lib/encryption';
import { calculateAge } from '@/lib/utils';
import {
  getQuery,
  ACTIVE_LABOR_PATIENTS,
  PARTOGRAPH_OBSERVATIONS,
} from '@/config/hosxp-queries';
import type { DatabaseDialect } from '@/config/hosxp-queries';
import {
  upsertCachedPatients,
  detectChanges,
  detectTransfers,
  markPatientsDelivered,
  type SyncPatientData,
} from './patient';
import {
  upsertPartographObservations,
  type PartographRow,
} from './partograph';
import { calculateAndStoreCpdScores } from './cpd-persist';
import { logger } from '@/lib/logger';

const pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

// ─── Intelligent Sync Lock Manager ───
// Prevents concurrent pulls for the same hospital and enforces cooldown periods.

interface SyncState {
  inProgress: boolean;
  syncStartedAt: number;
  lastSyncAt: number;
  lastJwtRefreshAt: number;
}

const syncStates: Map<string, SyncState> = new Map();
const SYNC_COOLDOWN_MS = 10_000;
const SYNC_TIMEOUT_MS = 60_000; // Force-release lock if sync runs longer than this

// Exported so tests can verify the auto-release timeout behavior directly.
// Production callers use this through requestImmediateSync(); tests need it
// to set up "stuck lock" scenarios without actually executing a real sync.
export function getSyncState(hospitalId: string): SyncState {
  let state = syncStates.get(hospitalId);
  if (!state) {
    state = { inProgress: false, syncStartedAt: 0, lastSyncAt: 0, lastJwtRefreshAt: 0 };
    syncStates.set(hospitalId, state);
  }
  // Auto-release stuck locks (e.g. process crashed or HOSxP request hung)
  if (state.inProgress && Date.now() - state.syncStartedAt > SYNC_TIMEOUT_MS) {
    console.warn(`[SYNC] Force-releasing stuck sync lock for hospital ${hospitalId} after ${SYNC_TIMEOUT_MS}ms`);
    state.inProgress = false;
  }
  return state;
}

// Test-only: clear the module-level sync state map between tests so they
// don't pollute each other. Underscore-prefixed to discourage prod use.
export function _resetSyncStatesForTesting(): void {
  syncStates.clear();
}

export interface ImmediateSyncResult {
  synced: boolean;
  reason: 'ok' | 'cooldown' | 'in_progress' | 'no_config' | 'error';
  lastSyncAt: string | null;
  patientsCount?: number;
}

/**
 * Request an immediate sync for a hospital. Intelligent algorithm:
 * 1. Check cooldown — skip if synced within SYNC_COOLDOWN_MS
 * 2. Acquire lock — skip if another sync is already in progress
 * 3. Check JWT expiry — refresh from user's session if expired
 * 4. Execute poll — same pipeline as scheduled polling
 * 5. Release lock
 */
export async function requestImmediateSync(
  db: DatabaseAdapter,
  hospitalId: string,
  sseManager: SseManager,
  _userSessionJwt?: string,
): Promise<ImmediateSyncResult> {
  const state = getSyncState(hospitalId);
  const now = Date.now();

  if (now - state.lastSyncAt < SYNC_COOLDOWN_MS) {
    return {
      synced: false,
      reason: 'cooldown',
      lastSyncAt: new Date(state.lastSyncAt).toISOString(),
    };
  }

  if (state.inProgress) {
    return {
      synced: false,
      reason: 'in_progress',
      lastSyncAt: state.lastSyncAt ? new Date(state.lastSyncAt).toISOString() : null,
    };
  }

  const configs = await db.query<{
    tunnel_url: string;
    session_jwt: string | null;
    session_expires_at: string | null;
    database_type: string | null;
  }>(
    'SELECT tunnel_url, session_jwt, session_expires_at, database_type FROM hospital_bms_config WHERE hospital_id = ?',
    [hospitalId],
  );

  if (configs.length === 0) {
    return { synced: false, reason: 'no_config', lastSyncAt: null };
  }

  const config = configs[0];

  state.inProgress = true;
  state.syncStartedAt = Date.now();

  try {
    const encryptionKey = process.env.ENCRYPTION_KEY ?? '';
    const validateUrl = process.env.BMS_VALIDATE_URL ?? 'https://hosxp.net/phapi/PasteJSON';
    let jwt = config.session_jwt;
    let bmsUrl = config.tunnel_url;
    let dbType = (config.database_type ?? 'postgresql') as DatabaseDialect;

    const jwtExpired = config.session_expires_at
      ? new Date(config.session_expires_at).getTime() < now
      : !jwt;

    if (!jwt || jwtExpired) {
      try {
        const client = new BmsSessionClient(config.tunnel_url);
        const sessionId = await client.getSessionId();
        const sessionConfig = await client.validateSession(sessionId, validateUrl);
        jwt = sessionConfig.jwt;
        bmsUrl = sessionConfig.bmsUrl;
        dbType = (await client.getDatabaseType(bmsUrl, jwt)) as DatabaseDialect;

        await db.execute(
          'UPDATE hospital_bms_config SET session_jwt = ?, database_type = ?, session_expires_at = ? WHERE hospital_id = ?',
          [jwt, dbType, sessionConfig.expiresAt.toISOString(), hospitalId],
        );
        state.lastJwtRefreshAt = now;
        logger.info('jwt_refreshed', { hospitalId });
      } catch {
        if (!jwt) {
          return { synced: false, reason: 'error', lastSyncAt: null };
        }
      }
    }

    await pollHospital(db, hospitalId, config.tunnel_url, bmsUrl, jwt, dbType, encryptionKey, sseManager);

    state.lastSyncAt = Date.now();

    const countResult = await db.query<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM cached_patients WHERE hospital_id = ? AND labor_status = 'ACTIVE'",
      [hospitalId],
    );

    return {
      synced: true,
      reason: 'ok',
      lastSyncAt: new Date(state.lastSyncAt).toISOString(),
      patientsCount: countResult[0]?.cnt ?? 0,
    };
  } catch (error) {
    logger.error('immediate_sync_failed', { hospitalId, error });
    return { synced: false, reason: 'error', lastSyncAt: null };
  } finally {
    state.inProgress = false;
  }
}

export async function pollHospital(
  db: DatabaseAdapter,
  hospitalId: string,
  tunnelUrl: string,
  bmsUrl: string,
  jwt: string,
  databaseType: DatabaseDialect,
  encryptionKey: string,
  sseManager: SseManager,
): Promise<void> {
  try {
    const client = new BmsSessionClient(tunnelUrl);

    const sql = getQuery(ACTIVE_LABOR_PATIENTS, databaseType);
    const result = await client.executeQuery(sql, bmsUrl, jwt);

    if (result.data.length === 0) {
      await db.execute(
        "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE id = ?",
        [new Date().toISOString(), hospitalId],
      );
      return;
    }

    const existing = await db.query<{ an: string }>(
      "SELECT an FROM cached_patients WHERE hospital_id = ? AND labor_status = 'ACTIVE'",
      [hospitalId],
    );
    const existingAns = existing.map((r) => r.an);

    const patients: SyncPatientData[] = result.data.map((row) => {
      const rawCid = row.cid ? String(row.cid).trim() : null;
      const fullName = [row.pname, row.fname, row.lname].filter(Boolean).join(' ').trim() || 'ไม่ระบุชื่อ';
      const age = row.birthday ? calculateAge(String(row.birthday)) : 0;

      return {
        hn: String(row.hn ?? ''),
        an: String(row.an ?? ''),
        name: encrypt(fullName, encryptionKey),
        cid: rawCid ? encrypt(rawCid, encryptionKey) : null,
        cidHash: rawCid ? createHash('sha256').update(rawCid).digest('hex') : null,
        age,
        gravida: row.preg_number != null ? Number(row.preg_number) : null,
        gaWeeks: row.ga != null ? Number(row.ga) : null,
        ancCount: row.anc_count != null ? Number(row.anc_count) : null,
        admitDate: `${row.regdate}T${row.regtime || '00:00:00'}`,
        laborStatus: 'ACTIVE',
        syncedAt: new Date().toISOString(),
      };
    });

    const count = await upsertCachedPatients(db, hospitalId, patients);

    const transfers = await detectTransfers(db, hospitalId, patients);

    const hospitalRows = await db.query<{ hcode: string }>(
      'SELECT hcode FROM hospitals WHERE id = ?',
      [hospitalId],
    );
    const hcode = hospitalRows[0]?.hcode ?? '';

    for (const transfer of transfers) {
      await db.execute(
        `UPDATE cached_patients SET labor_status = 'TRANSFERRED', updated_at = ?
         WHERE hospital_id = ? AND an = ?`,
        [new Date().toISOString(), transfer.fromHospitalId, transfer.fromAn],
      );

      const fromHospitalRows = await db.query<{ hcode: string }>(
        'SELECT hcode FROM hospitals WHERE id = ?',
        [transfer.fromHospitalId],
      );
      const fromHcode = fromHospitalRows[0]?.hcode ?? '';

      sseManager.broadcast('patient-update', {
        type: 'patient_transfer',
        fromHcode,
        toHcode: hcode,
        an: transfer.toAn,
      });
    }

    await calculateAndStoreCpdScores(db, hospitalId, sseManager);

    // Pull partograph observations for currently-admitted patients.
    // Must run AFTER upsertCachedPatients() so AN -> patient_id lookup works.
    try {
      const partographSql = getQuery(PARTOGRAPH_OBSERVATIONS, databaseType);
      const partographResult = await client.executeQuery(partographSql, bmsUrl, jwt);

      if (partographResult.data.length > 0) {
        // Resolve AN -> patient_id once for the batch.
        const ans = Array.from(
          new Set(partographResult.data.map((r) => String(r.an))),
        );
        const placeholders = ans.map(() => '?').join(',');
        const patientRows = await db.query<{ id: string; an: string }>(
          `SELECT id, an FROM cached_patients
             WHERE hospital_id = ? AND an IN (${placeholders})`,
          [hospitalId, ...ans],
        );
        const patientByAn = new Map(patientRows.map((p) => [p.an, p.id]));

        const rows: PartographRow[] = partographResult.data
          .map((row) => {
            const pid = patientByAn.get(String(row.an));
            if (!pid) return null;
            const r: PartographRow = {
              hospitalId,
              patientId: pid,
              sourceSystem: 'hosxp',
              sourcePk: String(row.ipt_labour_partograph_id),
              observeDatetime: String(row.observe_datetime),
              hourNo: row.hour_no != null ? Number(row.hour_no) : null,
              fetalHeartRate:
                row.fetal_heart_rate != null
                  ? Number(row.fetal_heart_rate)
                  : null,
              amnioticFluid: (row.amniotic_fluid as string | null) ?? null,
              amnioticTypeId:
                row.labour_amniotic_type_id != null
                  ? Number(row.labour_amniotic_type_id)
                  : null,
              amnioticTypeName:
                (row.amniotic_type_name as string | null) ?? null,
              moulding: (row.moulding as string | null) ?? null,
              cervicalDilationCm:
                row.cervical_dilation_cm != null
                  ? Number(row.cervical_dilation_cm)
                  : null,
              descentOfHead: (row.descent_of_head as string | null) ?? null,
              contractionPer10Min:
                row.contraction_per_10min != null
                  ? Number(row.contraction_per_10min)
                  : null,
              contractionDurationSec:
                row.contraction_duration_sec != null
                  ? Number(row.contraction_duration_sec)
                  : null,
              contractionStrength:
                (row.contraction_strength as string | null) ?? null,
              oxytocinUml:
                row.oxytocin_uml != null ? Number(row.oxytocin_uml) : null,
              oxytocinDropsMin:
                row.oxytocin_drops_min != null
                  ? Number(row.oxytocin_drops_min)
                  : null,
              drugsIvFluids: (row.drugs_iv_fluids as string | null) ?? null,
              pulse: row.pulse != null ? Number(row.pulse) : null,
              bpSystolic:
                row.bp_systolic != null ? Number(row.bp_systolic) : null,
              bpDiastolic:
                row.bp_diastolic != null ? Number(row.bp_diastolic) : null,
              temperature:
                row.temperature != null ? Number(row.temperature) : null,
              urineVolumeMl:
                row.urine_volume_ml != null
                  ? Number(row.urine_volume_ml)
                  : null,
              urineProtein: (row.urine_protein as string | null) ?? null,
              urineGlucose: (row.urine_glucose as string | null) ?? null,
              urineAcetone: (row.urine_acetone as string | null) ?? null,
              note: (row.note as string | null) ?? null,
              entryStaff: (row.entry_staff as string | null) ?? null,
              entryDatetime:
                row.entry_datetime != null
                  ? String(row.entry_datetime)
                  : null,
            };
            return r;
          })
          .filter((r): r is PartographRow => r !== null);

        const partographResultStats = await upsertPartographObservations(
          db,
          hospitalId,
          rows,
        );

        // Broadcast severity transitions only — not every observation.
        for (const sc of partographResultStats.severityChanges) {
          sseManager.broadcast('patient-update', {
            type: 'partograph_severity_changed',
            hcode,
            an: sc.an,
            severity: sc.to,
            alertCount: sc.alertCount,
          });
        }

        logger.info('partograph_sync_complete', {
          hospitalId,
          observationsUpserted: partographResultStats.upserted,
          patientsTouched: rows.length,
          severityChanges: partographResultStats.severityChanges.length,
        });
      }
    } catch (partographError) {
      // Partograph fetch failure should not abort the rest of the polling
      // cycle (patient list, CPD scores, transfers were already persisted).
      logger.error('partograph_sync_failed', {
        hospitalId,
        error: partographError,
      });
    }

    const changes = detectChanges(patients, existingAns);

    for (const an of changes.newAdmissions) {
      sseManager.broadcast('patient-update', {
        type: 'new_admission',
        hcode,
        an,
      });
    }

    if (changes.discharges.length > 0) {
      await markPatientsDelivered(db, hospitalId, changes.discharges);
      for (const an of changes.discharges) {
        sseManager.broadcast('patient-update', {
          type: 'patient_discharged',
          hcode,
          an,
        });
      }
    }

    if (count > 0) {
      sseManager.broadcast('sync-complete', {
        hcode,
        patientsUpdated: count,
        timestamp: new Date().toISOString(),
      });
    }

    await db.execute(
      "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE id = ?",
      [new Date().toISOString(), hospitalId],
    );
  } catch (error) {
    logger.error('polling_failed', { hospitalId, error });
    await db.execute(
      "UPDATE hospitals SET connection_status = 'OFFLINE' WHERE id = ?",
      [hospitalId],
    );

    const hospitalRows = await db.query<{ hcode: string }>(
      'SELECT hcode FROM hospitals WHERE id = ?',
      [hospitalId],
    );
    const hcode = hospitalRows[0]?.hcode ?? '';
    sseManager.broadcast('connection-status', {
      hcode,
      status: 'OFFLINE',
      lastSyncAt: new Date().toISOString(),
    });
  }
}

export async function startPolling(db: DatabaseAdapter, sseManager: SseManager): Promise<void> {
  const encryptionKey = process.env.ENCRYPTION_KEY ?? '';
  const validateUrl = process.env.BMS_VALIDATE_URL ?? 'https://hosxp.net/phapi/PasteJSON';

  const configs = await db.query<{
    hospital_id: string;
    tunnel_url: string;
    session_jwt: string | null;
    database_type: string | null;
  }>(
    'SELECT hbc.hospital_id, hbc.tunnel_url, hbc.session_jwt, hbc.database_type FROM hospital_bms_config hbc',
  );

  const numHospitals = configs.length;
  if (numHospitals === 0) {
    logger.info('polling_skipped_no_hospitals', {});
    return;
  }

  const POLLING_INTERVAL = 30000;
  const staggerMs = Math.floor(POLLING_INTERVAL / numHospitals);

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const delay = i * staggerMs;

    setTimeout(() => {
      const interval = setInterval(async () => {
        const state = getSyncState(config.hospital_id);
        if (state.inProgress) return;

        try {
          state.inProgress = true;
          state.syncStartedAt = Date.now();

          let jwt = config.session_jwt;
          let bmsUrl = config.tunnel_url;
          let dbType = (config.database_type ?? 'postgresql') as DatabaseDialect;

          const freshConfig = await db.query<{
            session_jwt: string | null;
            session_expires_at: string | null;
            database_type: string | null;
          }>(
            'SELECT session_jwt, session_expires_at, database_type FROM hospital_bms_config WHERE hospital_id = ?',
            [config.hospital_id],
          );
          if (freshConfig.length > 0) {
            jwt = freshConfig[0].session_jwt;
            dbType = (freshConfig[0].database_type ?? 'postgresql') as DatabaseDialect;

            const expired = freshConfig[0].session_expires_at
              ? new Date(freshConfig[0].session_expires_at).getTime() < Date.now()
              : !jwt;

            if (!jwt || expired) {
              const client = new BmsSessionClient(config.tunnel_url);
              const sessionId = await client.getSessionId();
              const sessionConfig = await client.validateSession(sessionId, validateUrl);
              jwt = sessionConfig.jwt;
              bmsUrl = sessionConfig.bmsUrl;
              dbType = (await client.getDatabaseType(bmsUrl, jwt)) as DatabaseDialect;

              await db.execute(
                'UPDATE hospital_bms_config SET session_jwt = ?, database_type = ?, session_expires_at = ? WHERE hospital_id = ?',
                [jwt, dbType, sessionConfig.expiresAt.toISOString(), config.hospital_id],
              );
            }
          }

          await pollHospital(db, config.hospital_id, config.tunnel_url, bmsUrl, jwt!, dbType, encryptionKey, sseManager);
          state.lastSyncAt = Date.now();
        } catch (error) {
          logger.error('poll_cycle_failed', { hospitalId: config.hospital_id, error });
        } finally {
          state.inProgress = false;
        }
      }, POLLING_INTERVAL);

      pollingIntervals.set(config.hospital_id, interval);
    }, delay);
  }

  logger.info('polling_started', { numHospitals, staggerMs });
}

export function stopPolling(): void {
  for (const [, interval] of pollingIntervals) {
    clearInterval(interval);
  }
  pollingIntervals.clear();
  logger.info('polling_stopped', {});
}
