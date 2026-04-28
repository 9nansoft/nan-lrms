// One-shot: register the existing HOSxP webhook key in the dev PGlite DB so the
// IPD smoke-test (HOSxPXEIPDModuleTest.exe) can authenticate.
//
// Usage:
//   1. Stop the dev server (PGlite has an exclusive lock on .pglite-data)
//   2. node register-hosxp-key.mjs
//   3. Restart `npm run dev`
import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';

const HCODE = '00000';
const HOSP_NAME = 'HOSxP UAT (smoke test)';
const RAW_KEY = 'kklrms_11d88c3910231230a4223fb2ae65485a7a0e356f';
const LABEL = 'HOSxP IPD smoke test (manual register)';
const PGLITE_PATH = process.env.PGLITE_PATH ?? './.pglite-data';

const keyHash = createHash('sha256').update(RAW_KEY).digest('hex');
const keyPrefix = RAW_KEY.slice(0, 8);
const now = new Date().toISOString();

const db = new PGlite(PGLITE_PATH);

console.log(`[register] PGlite at ${PGLITE_PATH}`);
console.log(`[register] hospital hcode=${HCODE}`);
console.log(`[register] key prefix=${keyPrefix} hash=${keyHash.slice(0, 16)}...`);

// Upsert hospital
const existing = await db.query('SELECT id, name FROM hospitals WHERE hcode = $1', [HCODE]);
let hospitalId;
if (existing.rows.length > 0) {
  hospitalId = existing.rows[0].id;
  console.log(`[register] hospital already exists: id=${hospitalId} name="${existing.rows[0].name}"`);
} else {
  hospitalId = randomUUID();
  await db.query(
    `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, 'UNKNOWN', $5, $5)`,
    [hospitalId, HCODE, HOSP_NAME, 'F1', now],
  );
  console.log(`[register] hospital created: id=${hospitalId}`);
}

// Check if key already exists
const existingKey = await db.query(
  'SELECT id, is_active, revoked_at FROM webhook_api_keys WHERE key_hash = $1',
  [keyHash],
);
if (existingKey.rows.length > 0) {
  const row = existingKey.rows[0];
  console.log(`[register] key already exists: id=${row.id} is_active=${row.is_active} revoked_at=${row.revoked_at}`);
  if (!row.is_active || row.revoked_at) {
    await db.query(
      'UPDATE webhook_api_keys SET is_active = true, revoked_at = NULL WHERE id = $1',
      [row.id],
    );
    console.log(`[register] reactivated existing key`);
  }
} else {
  const keyId = randomUUID();
  await db.query(
    `INSERT INTO webhook_api_keys (id, hospital_id, key_hash, key_prefix, label, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, true, $6)`,
    [keyId, hospitalId, keyHash, keyPrefix, LABEL, now],
  );
  console.log(`[register] key inserted: id=${keyId}`);
}

await db.close();
console.log('[register] done. restart `npm run dev` and rerun the smoke test.');
