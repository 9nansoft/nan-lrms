// T033: AdminSeeder — default admin user
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '../adapter';
import { DataSeeder } from './seeder';

export class AdminSeeder extends DataSeeder {
  getName(): string {
    return 'AdminSeeder';
  }

  async shouldRun(db: DatabaseAdapter): Promise<boolean> {
    const rows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM users',
    );
    return rows[0].count === 0;
  }

  async seed(db: DatabaseAdapter): Promise<number> {
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO users (id, bms_user_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), 'admin', 'ADMIN', true, now, now],
    );
    return 1;
  }
}
