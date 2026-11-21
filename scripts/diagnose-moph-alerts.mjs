// Read-only health check for the MOPH (LINE) alert pipeline.
//
//   node --env-file=.env scripts/diagnose-moph-alerts.mjs
//
// Prints, in order, every gate a consult/risk alert must pass before a LINE
// actually lands: master switch → transport config → recipients (center
// monitors, consult doctors × notification_preferences) → per-hospital BMS
// session (bms transport only) → the latest delivery attempts with their
// last_error. Works on the same DB the app uses (PGlite or Postgres).
//
// NOTE: PGlite is single-process — stop `npm run dev` first or this script
// cannot open the same data directory.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- env -------------------------------------------------------------------
// `node --env-file=.env` already populates process.env; fall back to a manual
// parse when the flag wasn't used.
if (!process.env.USE_PGLITE && !process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// ---- db connection ----------------------------------------------------------
let query;
if (process.env.USE_PGLITE === 'true') {
  const dataDir = resolve(process.env.PGLITE_PATH ?? './.pglite-data');
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dataDir);
  query = async (sql) => (await db.query(sql)).rows;
  console.log(`# PGlite @ ${dataDir}`);
} else {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  query = async (sql) => (await client.query(sql)).rows;
  console.log(`# Postgres @ ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);
}

const table = (title, rows) => {
  console.log(`\n== ${title} ==`);
  if (rows.length === 0) console.log('  (empty)');
  else console.table(rows);
};

// ---- 1. switches ------------------------------------------------------------
const transport = process.env.MOPH_TRANSPORT?.trim().toLowerCase() === 'v3.1' ? 'v3.1' : 'bms';
const v31Ready = Boolean(
  process.env.MOPH_ALERT_CLIENT_KEY?.trim() &&
    process.env.MOPH_ALERT_SECRET_KEY?.trim() &&
    process.env.MOPH_ALERT_TEMPLATE?.trim(),
);
console.log(`\n== switches ==`);
console.log(`  MOPH_ALERTS_ENABLED : ${process.env.MOPH_ALERTS_ENABLED ?? 'true (default)'}`);
console.log(`  MOPH_TRANSPORT      : ${transport}`);
console.log(`  ENCRYPTION_KEY      : ${process.env.ENCRYPTION_KEY ? 'set' : 'MISSING — enqueue silently drops alerts with a patient name'}`);
if (transport === 'v3.1') {
  console.log(`  v3.1 keys+template  : ${v31Ready ? 'configured' : 'NOT configured — every send dead-letters (fill MOPH_ALERT_TEMPLATE/keys, or set MOPH_TRANSPORT=bms)'}`);
}

// ---- 2. recipient readiness -------------------------------------------------
const docs = await query(`
  SELECT h.hcode, h.name AS hospital, d.cid, d.name AS doctor, d.is_active,
         (EXISTS (
            SELECT 1 FROM notification_preferences p
             WHERE p.user_cid = d.cid AND p.hospital_code = h.hcode
               AND p.moph_line_enabled = true
               AND ( EXISTS (
                       SELECT 1 FROM notification_event_subscriptions s
                        WHERE s.preference_id = p.id
                          AND s.event_key = 'consult_message' AND s.enabled = true )
                  OR NOT EXISTS (
                       SELECT 1 FROM notification_event_subscriptions s2
                        WHERE s2.preference_id = p.id ))
         )) AS pref_consult
  FROM hospital_consult_doctors d JOIN hospitals h ON h.id = d.hospital_id
  ORDER BY h.hcode`);
const ready = docs.filter((r) => r.is_active && r.pref_consult).length;
table(
  `consult doctors (ready = active + opted in to consult_message): ${ready}/${docs.length}`,
  docs.map((r) => ({ hcode: r.hcode, hospital: r.hospital, cid: r.cid, doctor: r.doctor, active: r.is_active, opted_in_consult: r.pref_consult })),
);

const mons = await query(`
  SELECT m.province, m.cid, m.name, m.is_active, h.name AS hospital_in_province
  FROM moph_center_monitors m
  LEFT JOIN hospitals h ON h.province_code = m.province
  ORDER BY m.province`);
table('province center monitors (always notified)', mons);

// ---- 3. BMS session per hospital (bms transport) ----------------------------
if (transport === 'bms') {
  const bms = await query(`
    SELECT h.hcode, h.name AS hospital, c.tunnel_url IS NOT NULL AS has_tunnel,
           left(coalesce(c.tunnel_url,''), 44) AS tunnel,
           to_char(c.session_expires_at, 'MM-DD HH24:MI') AS session_expires
    FROM hospitals h LEFT JOIN hospital_bms_config c ON c.hospital_id = h.id
    ORDER BY h.hcode`);
  table('hospital_bms_config (bms transport sends need a live tunnel+session)', bms);
}

// ---- 4. recent delivery attempts --------------------------------------------
const log = await query(`
  SELECT to_char(created_at,'MM-DD HH24:MI') AS at, alert_source, severity,
         recipient_scope, status, api_status, attempts,
         left(coalesce(last_error,''), 70) AS last_error
  FROM moph_alert_log ORDER BY created_at DESC LIMIT 15`);
table('moph_alert_log (latest 15) — empty means enqueue never fired (see recipients above)', log);

const deferred = await query(`
  SELECT to_char(created_at,'MM-DD HH24:MI') AS at, alert_source, status,
         left(case_id, 24) AS case_id
  FROM moph_alert_event_queue WHERE status = 'awaiting_recipients'
  ORDER BY created_at DESC LIMIT 10`);
table("moph_alert_event_queue awaiting_recipients — events raised before anyone opted in", deferred);

process.exit(0);
