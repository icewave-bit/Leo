import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { loadConfig } from '../config.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokensEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function assertBotBearer(req: { header: (name: string) => string | undefined }): void {
  const token = bearerToken(req.header('authorization'));
  if (!token || !tokensEqual(token, loadConfig().BOT_API_TOKEN)) {
    throw new AppError('UNAUTHORIZED', 401, 'Invalid bot token');
  }
}

function requireTelegramUserId(req: {
  header: (name: string) => string | undefined;
}): string {
  const rawId = req.header('x-telegram-user-id')?.trim();
  if (!rawId || !/^\d+$/.test(rawId)) {
    throw new AppError('VALIDATION', 400, 'X-Telegram-User-Id header is required', {
      'x-telegram-user-id': 'must be a numeric Telegram user id',
    });
  }
  return rawId;
}

/** Validates shared bot Bearer token only (no Telegram user lookup). */
export const requireBotBearer: RequestHandler = (req, _res, next) => {
  try {
    assertBotBearer(req);
    next();
  } catch (err) {
    next(err);
  }
};

/** Bearer + X-Telegram-User-Id → resolve linked tutor into req.tutorId. */
export const requireBotAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      assertBotBearer(req);
      const rawId = requireTelegramUserId(req);

      const result = await query<{ id: string }>(
        'SELECT id FROM tutors WHERE telegram_user_id = $1',
        [rawId],
      );
      const tutorId = result.rows[0]?.id;
      if (!tutorId) {
        throw new AppError('TELEGRAM_NOT_LINKED', 403, 'Telegram account is not linked');
      }

      req.tutorId = tutorId;
      req.botRole = 'tutor';
      next();
    } catch (err) {
      next(err);
    }
  })();
};

/** Bearer + X-Telegram-User-Id → resolve linked student into req.studentId + req.tutorId. */
export const requireBotStudentAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      assertBotBearer(req);
      const rawId = requireTelegramUserId(req);

      const result = await query<{ id: string; tutor_id: string }>(
        `SELECT id, tutor_id FROM students
         WHERE telegram_user_id = $1 AND archived_at IS NULL`,
        [rawId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new AppError('TELEGRAM_NOT_LINKED', 403, 'Telegram account is not linked');
      }

      req.studentId = row.id;
      req.tutorId = row.tutor_id;
      req.botRole = 'student';
      next();
    } catch (err) {
      next(err);
    }
  })();
};
