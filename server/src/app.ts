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
import { personalEventGroupsRouter } from './routes/personalEventGroups.js';
import { personalEventsRouter } from './routes/personalEvents.js';
import { recurringPersonalSchedulesRouter } from './routes/recurringPersonalSchedules.js';
import { scheduleSlotOverridesRouter } from './routes/scheduleSlotOverrides.js';
import { balanceMovementsRouter } from './routes/balanceMovements.js';
import { taxesRouter } from './routes/taxes.js';
import { botRouter } from './routes/bot.js';

const PgSession = connectPgSimple(session);

export async function createApp(): Promise<express.Express> {
  const config = loadConfig();
  const pool = getPool();

  const app = express();

  // Traefik terminates TLS and forwards HTTP; trust proxy so Secure session cookies are set.
  if (config.COOKIE_SECURE) {
    app.set('trust proxy', 1);
  }

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
  app.use('/api/bot', botRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/lessons', lessonsRouter);
  app.use('/api/recurring-schedules', recurringSchedulesRouter);
  app.use('/api/personal-event-groups', personalEventGroupsRouter);
  app.use('/api/personal-events', personalEventsRouter);
  app.use('/api/recurring-personal-schedules', recurringPersonalSchedulesRouter);
  app.use('/api/schedule-slot-overrides', scheduleSlotOverridesRouter);
  app.use('/api/balance-movements', balanceMovementsRouter);
  app.use('/api/taxes', taxesRouter);

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
