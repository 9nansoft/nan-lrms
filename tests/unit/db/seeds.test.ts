// T034: Seed orchestrator tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PgliteAdapter, createPglite } from '@/db/pglite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { SeedOrchestrator, HospitalSeeder, AdminSeeder } from '@/db/seeds/index';
import { ALL_TABLES } from '@/db/tables/index';

describe('SeedOrchestrator', () => {
  let db: PgliteAdapter;

  beforeEach(async () => {
    // Fresh instance per test: seeder shouldRun() guards are the subject
    // under test, so the DB must start truly empty (the shared harness
    // preserves the thai-geo lookups, which would skip ThaiGeoSeeder).
    db = new PgliteAdapter(createPglite());
    await SchemaSync.sync(db, ALL_TABLES, 'postgresql');
  });

  afterEach(async () => {
    await db.close();
  });

  it('should seed hospitals', async () => {
    const seeder = new HospitalSeeder();
    expect(await seeder.shouldRun(db)).toBe(true);
    const count = await seeder.seed(db);
    // Test env seeds NAN (production set, 14) + KK (legacy fixtures the
    // service tests are written against, 26) = 40.
    expect(count).toBe(40);
    expect(await seeder.shouldRun(db)).toBe(false);
    const kk = await db.query<{ id: string }>(
      'SELECT id FROM hospitals WHERE hcode = ?',
      ['10670'],
    );
    expect(kk).toHaveLength(1); // legacy KK fixture available to tests
    const nan = await db.query<{ id: string }>(
      'SELECT id FROM hospitals WHERE hcode = ?',
      ['10716'],
    );
    expect(nan).toHaveLength(1); // NAN hub available (demo-seeder uses it)
  });

  it('should seed admin user', async () => {
    const seeder = new AdminSeeder();
    expect(await seeder.shouldRun(db)).toBe(true);
    const count = await seeder.seed(db);
    expect(count).toBe(1);
    expect(await seeder.shouldRun(db)).toBe(false);
  });

  it('should run all seeders via orchestrator', async () => {
    const orchestrator = new SeedOrchestrator();
    await orchestrator.run(db);

    const hospitals = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM hospitals');
    expect(hospitals[0].count).toBe(40);

    const users = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(users[0].count).toBe(1);
  });

  it('should skip already-seeded data on re-run', async () => {
    const orchestrator = new SeedOrchestrator();
    await orchestrator.run(db);
    // Second run should skip
    await orchestrator.run(db);

    const hospitals = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM hospitals');
    expect(hospitals[0].count).toBe(40);
  });
});
