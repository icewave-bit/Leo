declare module 'connect-pg-simple' {
  import type session from 'express-session';
  import type { Pool } from 'pg';

  interface PgStoreOptions {
    pool: Pool;
    createTableIfMissing?: boolean;
  }

  type PgStore = new (options: PgStoreOptions) => session.Store;

  function connectPgSimple(session: typeof session): PgStore;
  export default connectPgSimple;
}
