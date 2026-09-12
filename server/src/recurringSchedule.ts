import type { PoolClient } from 'pg';
import { query } from './db.js';
import { AppError } from './errors.js';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  dateOnlyDiffDays,
  localStartMinutes,
  parseDateOnly,
  startOfWeekUTC,
  wallClockToUtc,
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

export function shiftWeekdays(weekdays: number[], dayDelta: number): number[] {
  return [...new Set(weekdays.map((d) => ((d + dayDelta) % 7 + 7) % 7))].sort((a, b) => a - b);
}

function weekStartForDate(startDate: string, weekStartsOn: WeekStartsOn): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(y!, m! - 1, d!));
  const ws = startOfWeekUTC(anchor, weekStartsOn);
  const year = ws.getUTCFullYear();
  const month = String(ws.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ws.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weekdayIndexForDate(dateKey: string, weekStartsOn: WeekStartsOn): number {
  return dateOnlyDiffDays(weekStartForDate(dateKey, weekStartsOn), dateKey);
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
  const hour = Math.floor(schedule.start_minutes / 60);
  const minute = schedule.start_minutes % 60;
  const { year, month, day } = parseDateOnly(occurrenceDate);
  return wallClockToUtc(year, month, day, hour, minute, prefs.timezone).toISOString();
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
): Promise<Array<{ id: string; student_id: string; start_utc: Date }>> {
  const result = await client.query<{ id: string; student_id: string; start_utc: Date }>(
    `DELETE FROM lessons
     WHERE recurring_schedule_id = $1
       AND tutor_id = $2
       AND status = 'planned'
       AND start_utc + (duration_min * interval '1 minute') > now()
     RETURNING id, student_id, start_utc`,
    [scheduleId, tutorId],
  );
  return result.rows;
}

/** Deletes this and following lessons in a series from the anchor occurrence onward. */
export async function deleteLessonsFromScheduleAnchor(
  client: PoolClient,
  scheduleId: string,
  tutorId: string,
  fromStartUtc: Date | string,
): Promise<Array<{ id: string; student_id: string; start_utc: Date }>> {
  const iso = typeof fromStartUtc === 'string' ? fromStartUtc : fromStartUtc.toISOString();
  const result = await client.query<{ id: string; student_id: string; start_utc: Date }>(
    `DELETE FROM lessons
     WHERE recurring_schedule_id = $1
       AND tutor_id = $2
       AND start_utc >= $3
     RETURNING id, student_id, start_utc`,
    [scheduleId, tutorId, iso],
  );
  return result.rows;
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

function toUtcDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

const RECURRING_SCHEDULE_ROW = `id, tutor_id, student_id, weekdays, start_minutes, duration_min,
            academic_units, type, notes, interval_weeks,
            start_date::text AS start_date, end_date::text AS end_date,
            active, created_at, updated_at`;

function weekdayOfOccurrence(
  startUtc: Date,
  prefs: TutorSchedulePrefs,
): number {
  return weekdayIndexForDate(dateKeyInTz(startUtc, prefs.timezone), prefs.week_starts_on);
}

function shiftedOccurrenceUtc(
  startUtc: Date,
  dayDelta: number,
  newStartMinutes: number,
  prefs: TutorSchedulePrefs,
): string {
  const shiftedDate = addDaysToDateOnly(dateKeyInTz(startUtc, prefs.timezone), dayDelta);
  return startUtcForOccurrence(shiftedDate, { start_minutes: newStartMinutes }, prefs);
}

async function fetchScheduleRow(
  client: PoolClient,
  id: string,
): Promise<RecurringScheduleRow> {
  const result = await client.query<RecurringScheduleRow>(
    `SELECT ${RECURRING_SCHEDULE_ROW}
     FROM recurring_schedules
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Recurring schedule not found');
  }
  return row;
}

async function rematerializeSchedule(
  client: PoolClient,
  scheduleId: string,
  prefs: TutorSchedulePrefs,
): Promise<void> {
  const schedule = await fetchScheduleRow(client, scheduleId);
  const horizon = resolveMaterializeHorizon(schedule, horizonEndDateFromNow(prefs.timezone));
  await materializeRecurringSchedule(client, schedule, prefs, horizon);
}

async function retimeLessons(
  client: PoolClient,
  moved: Array<{ id: string; newUtc: string }>,
  newScheduleId?: string,
): Promise<void> {
  if (moved.length === 0) return;

  const ids = moved.map((lesson) => lesson.id);
  if (newScheduleId) {
    await client.query(
      `UPDATE lessons SET recurring_schedule_id = $1, updated_at = now() WHERE id = ANY($2::uuid[])`,
      [newScheduleId, ids],
    );
  }
  await client.query(
    `UPDATE lessons
     SET start_utc = start_utc + INTERVAL '50 years'
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  for (const lesson of moved) {
    await client.query(`UPDATE lessons SET start_utc = $1, updated_at = now() WHERE id = $2`, [
      lesson.newUtc,
      lesson.id,
    ]);
  }
  const { clearSentRemindersForEntity } = await import('./botReminders.js');
  for (const lesson of moved) {
    await clearSentRemindersForEntity(client, 'lesson', lesson.id);
  }
}

async function remapSkips(opts: {
  client: PoolClient;
  fromScheduleId: string;
  toScheduleId: string;
  oldTimes: string[];
  newTimes: string[];
}): Promise<void> {
  if (opts.oldTimes.length === 0) return;
  await opts.client.query(
    `DELETE FROM recurring_schedule_skips
     WHERE recurring_schedule_id = $1 AND start_utc = ANY($2::timestamptz[])`,
    [opts.fromScheduleId, opts.oldTimes],
  );
  for (const skipUtc of opts.newTimes) {
    await skipRecurringOccurrence(opts.client, opts.toScheduleId, skipUtc);
  }
}

export async function moveRecurringSeriesFromAnchor(
  client: PoolClient,
  input: {
    tutorId: string;
    scheduleId: string;
    anchorStartUtc: Date | string;
    newStartUtc: Date | string;
  },
): Promise<void> {
  const prefs = await getTutorSchedulePrefs(input.tutorId);
  const tz = prefs.timezone;
  const anchor = toUtcDate(input.anchorStartUtc);
  const newStart = toUtcDate(input.newStartUtc);
  const anchorIso = anchor.toISOString();
  const dayDelta = dateOnlyDiffDays(dateKeyInTz(anchor, tz), dateKeyInTz(newStart, tz));
  const newStartMinutes = localStartMinutes(newStart, tz);
  const newDate = dateKeyInTz(newStart, tz);
  const sourceWeekday = weekdayOfOccurrence(anchor, prefs);
  const movedWeekdays = shiftWeekdays([sourceWeekday], dayDelta);

  const scheduleResult = await client.query<RecurringScheduleRow>(
    `SELECT ${RECURRING_SCHEDULE_ROW}
     FROM recurring_schedules
     WHERE id = $1 AND tutor_id = $2
     FOR UPDATE`,
    [input.scheduleId, input.tutorId],
  );
  const schedule = scheduleResult.rows[0];
  if (!schedule) {
    throw new AppError('NOT_FOUND', 404, 'Recurring schedule not found');
  }

  const leftoverWeekdays = schedule.weekdays.filter((day) => day !== sourceWeekday);
  const nextEndDate = schedule.end_date
    ? addDaysToDateOnly(formatDateOnly(schedule.end_date), dayDelta)
    : null;

  const lessons = await client.query<{ id: string; start_utc: Date }>(
    `SELECT id, start_utc
     FROM lessons
     WHERE recurring_schedule_id = $1
       AND tutor_id = $2
       AND start_utc >= $3
     FOR UPDATE`,
    [input.scheduleId, input.tutorId, anchorIso],
  );
  const streamLessons = lessons.rows.filter(
    (lesson) => weekdayOfOccurrence(lesson.start_utc, prefs) === sourceWeekday,
  );
  const moved = streamLessons.map((lesson) => ({
    id: lesson.id,
    newUtc: shiftedOccurrenceUtc(lesson.start_utc, dayDelta, newStartMinutes, prefs),
  }));

  const skips = await client.query<{ start_utc: Date }>(
    `SELECT start_utc
     FROM recurring_schedule_skips
     WHERE recurring_schedule_id = $1 AND start_utc >= $2`,
    [input.scheduleId, anchorIso],
  );
  const streamSkips = skips.rows.filter(
    (row) => weekdayOfOccurrence(row.start_utc, prefs) === sourceWeekday,
  );
  const oldSkipTimes = streamSkips.map((row) => row.start_utc.toISOString());
  const newSkipTimes = streamSkips.map((row) =>
    shiftedOccurrenceUtc(row.start_utc, dayDelta, newStartMinutes, prefs),
  );

  if (leftoverWeekdays.length === 0) {
    await retimeLessons(client, moved);
    await remapSkips({
      client,
      fromScheduleId: schedule.id,
      toScheduleId: schedule.id,
      oldTimes: oldSkipTimes,
      newTimes: newSkipTimes,
    });
    await client.query(
      `UPDATE recurring_schedules
       SET weekdays = $1,
           start_minutes = $2,
           start_date = $3,
           end_date = $4,
           updated_at = now()
       WHERE id = $5 AND tutor_id = $6`,
      [movedWeekdays, newStartMinutes, newDate, nextEndDate, input.scheduleId, input.tutorId],
    );
    await rematerializeSchedule(client, schedule.id, prefs);
    return;
  }

  const inserted = await client.query<RecurringScheduleRow>(
    `INSERT INTO recurring_schedules (
       tutor_id, student_id, weekdays, start_minutes, duration_min, academic_units,
       type, notes, interval_weeks, start_date, end_date, active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${RECURRING_SCHEDULE_ROW}`,
    [
      schedule.tutor_id,
      schedule.student_id,
      movedWeekdays,
      newStartMinutes,
      schedule.duration_min,
      schedule.academic_units,
      schedule.type,
      schedule.notes,
      schedule.interval_weeks,
      newDate,
      nextEndDate,
      schedule.active,
    ],
  );
  const split = inserted.rows[0];
  if (!split) {
    throw new AppError('NOT_FOUND', 404, 'Recurring schedule not found');
  }

  await retimeLessons(client, moved, split.id);
  await remapSkips({
    client,
    fromScheduleId: schedule.id,
    toScheduleId: split.id,
    oldTimes: oldSkipTimes,
    newTimes: newSkipTimes,
  });
  await client.query(
    `UPDATE recurring_schedules
     SET weekdays = $1, updated_at = now()
     WHERE id = $2 AND tutor_id = $3`,
    [leftoverWeekdays, schedule.id, input.tutorId],
  );
  await rematerializeSchedule(client, schedule.id, prefs);
  await rematerializeSchedule(client, split.id, prefs);
}

export async function topUpRecurringSchedules(tutorId: string): Promise<void> {
  const prefs = await getTutorSchedulePrefs(tutorId);
  const horizonEndDate = addDaysToDateOnly(
    dateKeyInTz(new Date(), prefs.timezone),
    RECURRING_HORIZON_WEEKS * 7,
  );

  const schedules = await query<RecurringScheduleRow>(
    `SELECT rs.id, rs.tutor_id, rs.student_id, rs.weekdays, rs.start_minutes, rs.duration_min,
            rs.academic_units, rs.type, rs.notes, rs.interval_weeks,
            rs.start_date::text AS start_date, rs.end_date::text AS end_date,
            rs.active, rs.created_at, rs.updated_at
     FROM recurring_schedules rs
     JOIN students s ON s.id = rs.student_id
     WHERE rs.tutor_id = $1 AND rs.active = true AND s.archived_at IS NULL`,
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
