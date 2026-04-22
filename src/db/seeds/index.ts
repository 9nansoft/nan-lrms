// T034: Seed orchestrator — register and run seeders in order
import type { DatabaseAdapter } from '../adapter';
import { DataSeeder } from './seeder';
import { ThaiGeoSeeder } from './thai-geo-seeder';
import { HospitalSeeder } from './hospital-seeder';
import { AdminSeeder } from './admin-seeder';
import { logger } from '@/lib/logger';

export class SeedOrchestrator {
  private seeders: DataSeeder[];

  constructor(seeders?: DataSeeder[]) {
    // ThaiGeoSeeder runs first — HospitalSeeder references province codes it
    // produces, and admin UI pickers consume provinces/districts immediately.
    this.seeders = seeders ?? [new ThaiGeoSeeder(), new HospitalSeeder(), new AdminSeeder()];
  }

  async run(db: DatabaseAdapter): Promise<void> {
    for (const seeder of this.seeders) {
      const shouldRun = await seeder.shouldRun(db);
      if (shouldRun) {
        const count = await seeder.seed(db);
        logger.info('seeder_completed', { seeder: seeder.getName(), count });
      } else {
        logger.info('seeder_skipped', { seeder: seeder.getName() });
      }
    }
  }
}

export { ThaiGeoSeeder, HospitalSeeder, AdminSeeder };
