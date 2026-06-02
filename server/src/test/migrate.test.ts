import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../migrate.js';

describe('migration runner', () => {
  const url = process.env.TEST_DATABASE_URL!;

  beforeAll(async () => {
    await runMigrations(url);
  });

  afterAll(async () => {
    const pool = new pg.Pool({ connectionString: url });
    await pool.end();
  });

  it('applies 001_init.sql and is idempotent on rerun', async () => {
    await runMigrations(url);
    await runMigrations(url);

    const pool = new pg.Pool({ connectionString: url });
    const applied = await pool.query(
      "SELECT filename FROM schema_migrations WHERE filename = '001_init.sql'",
    );
    expect(applied.rows).toHaveLength(1);
    await pool.end();
  });

  it('tables tutors, students, lessons exist with expected columns', async () => {
    const pool = new pg.Pool({ connectionString: url });
    const tables = ['tutors', 'students', 'lessons'] as const;
    for (const table of tables) {
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      expect(cols.rows.length).toBeGreaterThan(0);
    }

    const tutorCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tutors'`,
    );
    const names = tutorCols.rows.map((r) => r.column_name);
    expect(names).toContain('email');
    expect(names).toContain('password_hash');
    expect(names).toContain('timezone');

    await pool.end();
  });
});
