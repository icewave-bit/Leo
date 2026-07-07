import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  DEFAULT_BLOCK_WINDOW,
  effectiveSlotBlocked,
  overrideAfterToggle,
  type DefaultBlockWindow,
  type SlotOverrideRow,
} from '../scheduleBlocks.js';
import { validate } from '../validate.js';

const putSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(23 * 60),
  hasEvent: z.boolean().default(false),
});

export interface ScheduleSlotOverride {
  weekday: number;
  startMinutes: number;
  blocked: boolean;
}

function toOverride(row: SlotOverrideRow): ScheduleSlotOverride {
  return {
    weekday: row.weekday,
    startMinutes: row.start_minutes,
    blocked: row.blocked,
  };
}

export const scheduleSlotOverridesRouter = Router();

scheduleSlotOverridesRouter.use(requireAuth);

scheduleSlotOverridesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query<SlotOverrideRow>(
      `SELECT weekday, start_minutes, blocked
       FROM schedule_slot_overrides
       WHERE tutor_id = $1
       ORDER BY weekday, start_minutes`,
      [req.tutorId],
    );
    res.json(result.rows.map(toOverride));
  } catch (err) {
    next(err);
  }
});

/** Toggle block state for one hour slot. */
scheduleSlotOverridesRouter.put('/toggle', async (req, res, next) => {
  try {
    const body = validate(putSchema, req.body);
    const startMinutes = body.startMinutes - (body.startMinutes % 60);

    const tutorRow = await query<{
      default_block_start_minutes: number;
      default_block_end_minutes: number;
    }>(
      `SELECT default_block_start_minutes, default_block_end_minutes
       FROM tutors WHERE id = $1`,
      [req.tutorId],
    );
    const blockWindow: DefaultBlockWindow = tutorRow.rows[0]
      ? {
          startMinutes: tutorRow.rows[0].default_block_start_minutes,
          endMinutes: tutorRow.rows[0].default_block_end_minutes,
        }
      : DEFAULT_BLOCK_WINDOW;

    const existing = await query<SlotOverrideRow>(
      `SELECT weekday, start_minutes, blocked
       FROM schedule_slot_overrides
       WHERE tutor_id = $1 AND weekday = $2 AND start_minutes = $3`,
      [req.tutorId, body.weekday, startMinutes],
    );
    const override = existing.rows[0];

    const current = effectiveSlotBlocked(startMinutes, override, body.hasEvent, blockWindow);
    const next = !current;
    const stored = overrideAfterToggle(startMinutes, next, body.hasEvent, blockWindow);

    if (stored === null) {
      await query(
        `DELETE FROM schedule_slot_overrides
         WHERE tutor_id = $1 AND weekday = $2 AND start_minutes = $3`,
        [req.tutorId, body.weekday, startMinutes],
      );
    } else {
      await query(
        `INSERT INTO schedule_slot_overrides (tutor_id, weekday, start_minutes, blocked)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tutor_id, weekday, start_minutes)
         DO UPDATE SET blocked = EXCLUDED.blocked, updated_at = now()`,
        [req.tutorId, body.weekday, startMinutes, stored],
      );
    }

    const all = await query<SlotOverrideRow>(
      `SELECT weekday, start_minutes, blocked
       FROM schedule_slot_overrides
       WHERE tutor_id = $1
       ORDER BY weekday, start_minutes`,
      [req.tutorId],
    );
    res.json({
      overrides: all.rows.map(toOverride),
      blocked: next,
    });
  } catch (err) {
    next(err);
  }
});
