import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import pg from 'pg';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

describe('seed', () => {
  const url = process.env.TEST_DATABASE_URL!;

  beforeAll(async () => {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query('TRUNCATE TABLE lessons, students, tutors RESTART IDENTITY CASCADE');
    await pool.query('DELETE FROM session').catch(() => {});
    await pool.end();
    await runMigrations(url);
  });

  afterAll(async () => {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query('TRUNCATE TABLE lessons, students, tutors RESTART IDENTITY CASCADE');
    await pool.end();
  });

  it('runs and produces demo tutor with students and lessons', () => {
    execSync('pnpm seed', {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });

    return (async () => {
      const pool = new pg.Pool({ connectionString: url });
      const tutor = await pool.query(
        "SELECT id FROM tutors WHERE LOWER(email) = 'anna@tutormonitor.app'",
      );
      expect(tutor.rows).toHaveLength(1);

      const students = await pool.query('SELECT COUNT(*)::int AS c FROM students WHERE tutor_id = $1', [
        tutor.rows[0]!.id,
      ]);
      expect(students.rows[0]!.c).toBe(5);

      const lessons = await pool.query('SELECT COUNT(*)::int AS c FROM lessons WHERE tutor_id = $1', [
        tutor.rows[0]!.id,
      ]);
      expect(lessons.rows[0]!.c).toBe(6);

      await pool.end();
    })();
  });
});
