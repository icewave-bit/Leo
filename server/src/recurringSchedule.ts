import type { PoolClient } from 'pg';
import { query } from './db.js';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  slotToStartUtc,
  startOfWeekUTC,
  weekdayIndexInWeek,
} from './scheduleSlots.js';
import type { RecurringScheduleRow } from './mappers.js';
import type { WeekStartsOn } from './types.js';

export const RECURRING_HORIZON_WEEKS = 12;

interface TutorSchedulePrefs {
  timezone: string;
  week_starts_on: WeekStartsOn;
}

function formatDateOnly(value: string | Date): string {
  if (typeof value === 'string') return value;
  const utc = new Date(value.getTime() + value.getTimezoneOffset() * 60_000);
  return utc.toISOString().slice(0, 10);
}

function compareDateOnly(a: string, b: string): number {
  return a.localeCompare(b);
}

export { compareDateOnly };

function weekStartForDate(startDate: string, weekStartsOn: WeekStartsOn): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(y!, m! - 1, d!));
  const ws = startOfWeekUTC(anchor, weekStartsOn);
  const year = ws.getUTCFullYear();
  const month = String(ws.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ws.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function occurrenceDatesForSchedule(
  schedule: Pick<
    RecurringScheduleRow,
    'start_date' | 'end_date' | 'interval_weeks' | 'weekdays'
  >,
  horizonEndDate: string,
  prefs: TutorSchedulePrefs,
): string[] {
  const start = formatDateOnly(schedule.start_date);
  const end = schedule.end_date ? formatDateOnly(schedule.end_date) : null;
  const effectiveEnd =
    end && compareDateOnly(end, horizonEndDate) < 0 ? end : horizonEndDate;

  const weekdays = [...schedule.weekdays].sort((a, b) => a - b);
  const firstWeekStart = weekStartForDate(start, prefs.week_starts_on);
  const dates: string[] = [];
  const seen = new Set<string>();

  for (let weekOffset = 0; weekOffset < 520; weekOffset++) {
    if (weekOffset % schedule.interval_weeks !== 0) continue;

    const weekStart = addDaysToDateOnly(firstWeekStart, weekOffset * 7);
    if (compareDateOnly(weekStart, effectiveEnd) > 0) break;

    for (const weekday of weekdays) {
      const date = addDaysToDateOnly(weekStart, weekday);
      if (compareDateOnly(date, start) < 0) continue;
      if (compareDateOnly(date, effectiveEnd) > 0) continue;
      if (seen.has(date)) continue;
      seen.add(date);
      dates.push(date);
    }
  }

  return dates.sort();
}

export function startUtcForOccurrence(
  occurrenceDate: string,
  schedule: Pick<RecurringScheduleRow, 'start_minutes'>,
  prefs: TutorSchedulePrefs,
): string {
  const startHours = schedule.start_minutes / 60;
  const [y, m, d] = occurrenceDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(y!, m! - 1, d!));
  const weekStart = startOfWeekUTC(anchor, prefs.week_starts_on);
  const day = weekdayIndexInWeek(anchor, weekStart, prefs.timezone);
  return slotToStartUtc(weekStart, day, startHours, prefs.timezone);
}

export async function getTutorSchedulePrefs(tutorId: string): Promise<TutorSchedulePrefs> {
  const result = await query<TutorSchedulePrefs>(
    'SELECT timezone, week_starts_on FROM tutors WHERE id = $1',
    [tutorId],
  );
  return result.rows[0]!;
}

export async function materializeRecurringSchedule(
  client: PoolClient,
  schedule: RecurringScheduleRow,
  prefs: TutorSchedulePrefs,
  horizonEndDate: string,
): Promise<number> {
  const dates = occurrenceDatesForSchedule(schedule, horizonEndDate, prefs);
  let inserted = 0;

  for (const date of dates) {
    const startUtc = startUtcForOccurrence(date, schedule, prefs);
    const result = await client.query(
      `INSERT INTO lessons (
         tutor_id, student_id, start_utc, duration_min, academic_units,
         status, type, paid, notes, recurring_schedule_id
       )
       SELECT $1, $2, $3, $4, $5, 'planned', $6, false, $7, $8
       WHERE NOT EXISTS (
         SELECT 1 FROM lessons
         WHERE recurring_schedule_id = $8 AND start_utc = $3
       )
       AND NOT EXISTS (
         SELECT 1 FROM recurring_schedule_skips
         WHERE recurring_schedule_id = $8 AND start_utc = $3
       )`,
      [
        schedule.tutor_id,
        schedule.student_id,
        startUtc,
        schedule.duration_min,
        schedule.academic_units,
        schedule.type,
        schedule.notes,
        schedule.id,
      ],
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

/** Deletes planned lessons in a series from now onward (e.g. when pausing). */
export async function deleteFutureLessonsForSchedule(
  client: PoolClient,
  scheduleId: string,
  tutorId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM lessons
     WHERE recurring_schedule_id = $1
       AND tutor_id = $2
       AND status = 'planned'
       AND start_utc + (duration_min * interval '1 minute') > now()`,
    [scheduleId, tutorId],
  );
}

/** Deletes this and following lessons in a series from the anchor occurrence onward. */
export async function deleteLessonsFromScheduleAnchor(
  client: PoolClient,
  scheduleId: string,
  tutorId: string,
  fromStartUtc: Date | string,
): Promise<void> {
  const iso = typeof fromStartUtc === 'string' ? fromStartUtc : fromStartUtc.toISOString();
  await client.query(
    `DELETE FROM lessons
     WHERE recurring_schedule_id = $1
       AND tutor_id = $2
       AND start_utc >= $3`,
    [scheduleId, tutorId, iso],
  );
}

export async function skipRecurringOccurrence(
  client: PoolClient,
  recurringScheduleId: string,
  startUtc: Date | string,
): Promise<void> {
  const iso = typeof startUtc === 'string' ? startUtc : startUtc.toISOString();
  await client.query(
    `INSERT INTO recurring_schedule_skips (recurring_schedule_id, start_utc)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [recurringScheduleId, iso],
  );
}

export async function topUpRecurringSchedules(tutorId: string): Promise<void> {
  const prefs = await getTutorSchedulePrefs(tutorId);
  const horizonEndDate = addDaysToDateOnly(
    dateKeyInTz(new Date(), prefs.timezone),
    RECURRING_HORIZON_WEEKS * 7,
  );

  const schedules = await query<RecurringScheduleRow>(
    `SELECT id, tutor_id, student_id, weekdays, start_minutes, duration_min, academic_units,
            type, notes, interval_weeks, start_date::text AS start_date, end_date::text AS end_date,
            active, created_at, updated_at
     FROM recurring_schedules
     WHERE tutor_id = $1 AND active = true`,
    [tutorId],
  );

  if (schedules.rows.length === 0) return;

  const client = await (await import('./db.js')).getPool().connect();
  try {
    await client.query('BEGIN');
    for (const schedule of schedules.rows) {
      const horizon = resolveMaterializeHorizon(schedule, horizonEndDate);
      await materializeRecurringSchedule(client, schedule, prefs, horizon);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function horizonEndDateFromNow(timezone: string): string {
  return addDaysToDateOnly(
    dateKeyInTz(new Date(), timezone),
    RECURRING_HORIZON_WEEKS * 7,
  );
}

export function resolveMaterializeHorizon(
  schedule: Pick<RecurringScheduleRow, 'start_date' | 'end_date'>,
  rollingHorizon: string,
): string {
  const fromStart = addDaysToDateOnly(
    formatDateOnly(schedule.start_date),
    RECURRING_HORIZON_WEEKS * 7,
  );
  let horizon =
    compareDateOnly(fromStart, rollingHorizon) > 0 ? fromStart : rollingHorizon;
  if (schedule.end_date && compareDateOnly(schedule.end_date, horizon) < 0) {
    horizon = formatDateOnly(schedule.end_date);
  }
  return horizon;
}

export function countOccurrences(
  startDate: string,
  endDate: string | null,
  intervalWeeks: number,
  weekdays: number[],
  prefs: TutorSchedulePrefs,
  horizonWeeks = RECURRING_HORIZON_WEEKS,
): number {
  const rollingHorizon = addDaysToDateOnly(
    startDate,
    horizonWeeks * 7,
  );
  const horizonEnd =
    endDate && compareDateOnly(endDate, rollingHorizon) < 0 ? endDate : rollingHorizon;
  return occurrenceDatesForSchedule(
    {
      start_date: startDate,
      end_date: endDate,
      interval_weeks: intervalWeeks,
      weekdays,
    },
    horizonEnd,
    prefs,
  ).length;
}
