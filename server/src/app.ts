import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { loadConfig } from './config.js';
import { AppError } from './errors.js';
import { getPool } from './db.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { studentsRouter } from './routes/students.js';
import { lessonsRouter } from './routes/lessons.js';
import { recurringSchedulesRouter } from './routes/recurringSchedules.js';
import { balanceMovementsRouter } from './routes/balanceMovements.js';

const PgSession = connectPgSimple(session);

export async function createApp(): Promise<express.Express> {
  const config = loadConfig();
  const pool = getPool();

  const app = express();

  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/lessons', lessonsRouter);
  app.use('/api/recurring-schedules', recurringSchedulesRouter);
  app.use('/api/balance-movements', balanceMovementsRouter);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction, // eslint-disable-line @typescript-eslint/no-unused-vars
    ) => {
      if (err instanceof AppError) {
        res.status(err.status).json({
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        });
        return;
      }
      console.error(err);
      const isProd = config.NODE_ENV === 'production';
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: isProd ? 'Internal server error' : String(err),
        },
      });
    },
  );

  return app;
}
