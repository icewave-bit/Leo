import { Router } from 'express';
import { z } from 'zod';
import { deriveInitials, hashPassword, verifyPassword } from '../auth/password.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { toTutor, type TutorRow } from '../mappers.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';

const registerSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
  name: z.string().min(1),
  timezone: z.string().min(1).default('UTC'),
});

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

const patchMeSchema = z
  .object({
    academicHourMin: z.number().int().min(15).max(180).optional(),
    weekStartsOn: z.enum(['monday', 'sunday']).optional(),
    defaultReplenishBalanceKind: z.enum(['money', 'lessons']).optional(),
    taxRatePercent: z.number().min(0).max(100).optional(),
    taxDisplayCurrency: z.enum(['BYN', 'none']).optional(),
    hiddenWeekdays: z
      .array(z.number().int().min(0).max(6))
      .max(6)
      .refine((arr) => new Set(arr).size === arr.length, 'Duplicate weekdays')
      .optional(),
    defaultBlockStartMinutes: z
      .number()
      .int()
      .min(0)
      .max(23 * 60)
      .refine((n) => n % 60 === 0, 'Hour-aligned')
      .optional(),
    defaultBlockEndMinutes: z
      .number()
      .int()
      .min(0)
      .max(23 * 60)
      .refine((n) => n % 60 === 0, 'Hour-aligned')
      .optional(),
    personalEventOutline: z.enum(['tab', 'frame', 'dashed']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const TUTOR_COLUMNS = `id, email, name, initials, subject, timezone, academic_hour_min, week_starts_on,
  default_replenish_balance_kind, tax_rate_percent, tax_display_currency, hidden_weekdays,
  default_block_start_minutes, default_block_end_minutes, personal_event_outline, created_at`;

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = validate(registerSchema, req.body);
    const initials = deriveInitials(body.name);
    const passwordHash = await hashPassword(body.password);

    const existing = await query<{ id: string }>(
      'SELECT id FROM tutors WHERE LOWER(email) = $1',
      [body.email],
    );
    if (existing.rows.length > 0) {
      throw new AppError('EMAIL_TAKEN', 409, 'Email is already registered');
    }

    const inserted = await query<TutorRow>(
      `INSERT INTO tutors (email, password_hash, name, initials, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${TUTOR_COLUMNS}`,
      [body.email, passwordHash, body.name, initials, body.timezone],
    );
    const tutor = toTutor(inserted.rows[0]!);
    req.session.tutorId = tutor.id;
    res.status(201).json({ tutor });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = validate(loginSchema, req.body);
    const result = await query<TutorRow & { password_hash: string }>(
      `SELECT ${TUTOR_COLUMNS}, password_hash
       FROM tutors WHERE LOWER(email) = $1`,
      [body.email],
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(row.password_hash, body.password))) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }
    const tutor = toTutor(row);
    req.session.tutorId = tutor.id;
    res.json({ tutor });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      next(err);
      return;
    }
    res.clearCookie('connect.sid');
    res.status(204).send();
  });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query<TutorRow>(
      `SELECT ${TUTOR_COLUMNS}
       FROM tutors WHERE id = $1`,
      [req.tutorId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }
    res.json({ tutor: toTutor(row) });
  } catch (err) {
    next(err);
  }
});

authRouter.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const body = validate(patchMeSchema, req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.academicHourMin !== undefined) {
      fields.push(`academic_hour_min = $${idx++}`);
      values.push(body.academicHourMin);
    }
    if (body.weekStartsOn !== undefined) {
      fields.push(`week_starts_on = $${idx++}`);
      values.push(body.weekStartsOn);
    }
    if (body.defaultReplenishBalanceKind !== undefined) {
      fields.push(`default_replenish_balance_kind = $${idx++}`);
      values.push(body.defaultReplenishBalanceKind);
    }
    if (body.taxRatePercent !== undefined) {
      fields.push(`tax_rate_percent = $${idx++}`);
      values.push(body.taxRatePercent);
    }
    if (body.taxDisplayCurrency !== undefined) {
      fields.push(`tax_display_currency = $${idx++}`);
      values.push(body.taxDisplayCurrency);
    }
    if (body.hiddenWeekdays !== undefined) {
      fields.push(`hidden_weekdays = $${idx++}`);
      values.push(body.hiddenWeekdays);
    }
    if (body.defaultBlockStartMinutes !== undefined) {
      fields.push(`default_block_start_minutes = $${idx++}`);
      values.push(body.defaultBlockStartMinutes);
    }
    if (body.defaultBlockEndMinutes !== undefined) {
      fields.push(`default_block_end_minutes = $${idx++}`);
      values.push(body.defaultBlockEndMinutes);
    }
    if (body.personalEventOutline !== undefined) {
      fields.push(`personal_event_outline = $${idx++}`);
      values.push(body.personalEventOutline);
    }

    values.push(req.tutorId);
    const result = await query<TutorRow>(
      `UPDATE tutors SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING ${TUTOR_COLUMNS}`,
      values,
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }
    res.json({ tutor: toTutor(row) });
  } catch (err) {
    next(err);
  }
});
