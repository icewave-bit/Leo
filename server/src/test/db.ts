import pg from 'pg';
import { runMigrations } from '../migrate.js';
import { setPoolForTests, closePool } from '../db.js';

let migrationsApplied = false;

export async function setupTestDb(): Promise<pg.Pool> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required');

  if (!migrationsApplied) {
    await runMigrations(url);
    migrationsApplied = true;
  }

  const pool = new pg.Pool({ connectionString: url });
  setPoolForTests(pool);
  await truncateAll(pool);
  return pool;
}

export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE lessons, recurring_schedule_skips, recurring_schedules, students, tutors RESTART IDENTITY CASCADE
  `);
  try {
    await pool.query('DELETE FROM session');
  } catch {
    // session table is created on first app boot
  }
}

export async function teardownTestDb(): Promise<void> {
  await closePool();
  migrationsApplied = false;
}
