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

/** Validates shared bot Bearer token only (no Telegram user lookup). */
export const requireBotBearer: RequestHandler = (req, _res, next) => {
  try {
    const token = bearerToken(req.header('authorization'));
    if (!token || !tokensEqual(token, loadConfig().BOT_API_TOKEN)) {
      throw new AppError('UNAUTHORIZED', 401, 'Invalid bot token');
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Bearer + X-Telegram-User-Id → resolve linked tutor into req.tutorId. */
export const requireBotAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const token = bearerToken(req.header('authorization'));
      if (!token || !tokensEqual(token, loadConfig().BOT_API_TOKEN)) {
        throw new AppError('UNAUTHORIZED', 401, 'Invalid bot token');
      }

      const rawId = req.header('x-telegram-user-id')?.trim();
      if (!rawId || !/^\d+$/.test(rawId)) {
        throw new AppError('VALIDATION', 400, 'X-Telegram-User-Id header is required', {
          'x-telegram-user-id': 'must be a numeric Telegram user id',
        });
      }

      const result = await query<{ id: string }>(
        'SELECT id FROM tutors WHERE telegram_user_id = $1',
        [rawId],
      );
      const tutorId = result.rows[0]?.id;
      if (!tutorId) {
        throw new AppError('TELEGRAM_NOT_LINKED', 403, 'Telegram account is not linked');
      }

      req.tutorId = tutorId;
      next();
    } catch (err) {
      next(err);
    }
  })();
};
