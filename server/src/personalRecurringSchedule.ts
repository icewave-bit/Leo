import type { PoolClient } from 'pg';
import { query } from './db.js';
import { addDaysToDateOnly, dateKeyInTz } from './scheduleSlots.js';
import type { RecurringPersonalScheduleRow } from './mappers.js';
import {
  RECURRING_HORIZON_WEEKS,
  getTutorSchedulePrefs,
  occurrenceDatesForSchedule,
  resolveMaterializeHorizon,
  startUtcForOccurrence,
} from './recurringSchedule.js';

export async function materializeRecurringPersonalSchedule(
  client: PoolClient,
  schedule: RecurringPersonalScheduleRow,
  prefs: Awaited<ReturnType<typeof getTutorSchedulePrefs>>,
  horizonEndDate: string,
): Promise<number> {
  const dates = occurrenceDatesForSchedule(schedule, horizonEndDate, prefs);
  let inserted = 0;

  for (const date of dates) {
    const startUtc = startUtcForOccurrence(date, schedule, prefs);
    const result = await client.query(
      `INSERT INTO personal_events (
         tutor_id, group_id, title, start_utc, duration_min, notes,
         recurring_personal_schedule_id
       )
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE NOT EXISTS (
         SELECT 1 FROM personal_events
         WHERE recurring_personal_schedule_id = $7 AND start_utc = $4
       )
       AND NOT EXISTS (
         SELECT 1 FROM recurring_personal_schedule_skips
         WHERE recurring_personal_schedule_id = $7 AND start_utc = $4
       )`,
      [
        schedule.tutor_id,
        schedule.group_id,
        schedule.title,
        startUtc,
        schedule.duration_min,
        schedule.notes,
        schedule.id,
      ],
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

export async function deleteFuturePersonalEventsForSchedule(
  client: PoolClient,
  scheduleId: string,
  tutorId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM personal_events
     WHERE recurring_personal_schedule_id = $1
       AND tutor_id = $2
       AND start_utc + (duration_min * interval '1 minute') > now()`,
    [scheduleId, tutorId],
  );
}

export async function deletePersonalEventsFromScheduleAnchor(
  client: PoolClient,
  scheduleId: string,
  tutorId: string,
  fromStartUtc: Date | string,
): Promise<void> {
  const iso = typeof fromStartUtc === 'string' ? fromStartUtc : fromStartUtc.toISOString();
  await client.query(
    `DELETE FROM personal_events
     WHERE recurring_personal_schedule_id = $1
       AND tutor_id = $2
       AND start_utc >= $3`,
    [scheduleId, tutorId, iso],
  );
}

export async function skipRecurringPersonalOccurrence(
  client: PoolClient,
  recurringPersonalScheduleId: string,
  startUtc: Date | string,
): Promise<void> {
  const iso = typeof startUtc === 'string' ? startUtc : startUtc.toISOString();
  await client.query(
    `INSERT INTO recurring_personal_schedule_skips (recurring_personal_schedule_id, start_utc)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [recurringPersonalScheduleId, iso],
  );
}

const RECURRING_PERSONAL_COLUMNS = `id, tutor_id, group_id, title, weekdays, start_minutes, duration_min,
  notes, interval_weeks, start_date::text AS start_date, end_date::text AS end_date, active, created_at, updated_at`;

export async function topUpRecurringPersonalSchedules(tutorId: string): Promise<void> {
  const prefs = await getTutorSchedulePrefs(tutorId);
  const horizonEndDate = addDaysToDateOnly(
    dateKeyInTz(new Date(), prefs.timezone),
    RECURRING_HORIZON_WEEKS * 7,
  );

  const schedules = await query<RecurringPersonalScheduleRow>(
    `SELECT ${RECURRING_PERSONAL_COLUMNS}
     FROM recurring_personal_schedules
     WHERE tutor_id = $1 AND active = true`,
    [tutorId],
  );

  if (schedules.rows.length === 0) return;

  const client = await (await import('./db.js')).getPool().connect();
  try {
    await client.query('BEGIN');
    for (const schedule of schedules.rows) {
      const horizon = resolveMaterializeHorizon(schedule, horizonEndDate);
      await materializeRecurringPersonalSchedule(client, schedule, prefs, horizon);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
