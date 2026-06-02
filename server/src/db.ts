import pg from 'pg';
import type { QueryResultRow } from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(connectionString?: string): pg.Pool {
  if (!pool) {
    const url = connectionString ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export function setPoolForTests(testPool: pg.Pool): void {
  pool = testPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
