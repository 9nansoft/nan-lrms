// T034: Seed orchestrator tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '@/db/sqlite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { SeedOrchestrator, HospitalSeeder, AdminSeeder } from '@/db/seeds/index';
import { ALL_TABLES } from '@/db/tables/index';

describe('SeedOrchestrator', () => {
  let db: SqliteAdapter;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await SchemaSync.sync(db, ALL_TABLES, 'sqlite');
  });

  afterEach(async () => {
    await db.close();
  });

  it('should seed hospitals', async () => {
    const seeder = new HospitalSeeder();
    expect(await seeder.shouldRun(db)).toBe(true);
    const count = await seeder.seed(db);
    expect(count).toBe(26);
    expect(await seeder.shouldRun(db)).toBe(false);
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
    expect(hospitals[0].count).toBe(26);

    const users = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(users[0].count).toBe(1);
  });

  it('should skip already-seeded data on re-run', async () => {
    const orchestrator = new SeedOrchestrator();
    await orchestrator.run(db);
    // Second run should skip
    await orchestrator.run(db);

    const hospitals = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM hospitals');
    expect(hospitals[0].count).toBe(26);
  });
});
