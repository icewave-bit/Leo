import { query } from './db.js';
import { AppError } from './errors.js';
import type { PersonalEventRow } from './mappers.js';
import { computeOpenSlotsForWeek, type OpenSlotsDay } from './openSlots.js';
import { topUpRecurringPersonalSchedules } from './personalRecurringSchedule.js';
import { topUpRecurringSchedules } from './recurringSchedule.js';
import type { SlotOverrideRow } from './scheduleBlocks.js';
import { zonedWeekRangeUtc } from './scheduleSlots.js';
import type { WeekStartsOn } from './types.js';

type TutorOpenSlotsPrefs = {
  timezone: string;
  week_starts_on: WeekStartsOn;
  hidden_weekdays: number[] | null;
  default_block_start_minutes: number;
  default_block_end_minutes: number;
};

export type OpenSlotsPayload = {
  timezone: string;
  weekStartsOn: WeekStartsOn;
  from: string;
  to: string;
  days: OpenSlotsDay[];
};

export async function buildOpenSlotsForTutor(tutorId: string): Promise<OpenSlotsPayload> {
  const prefsResult = await query<TutorOpenSlotsPrefs>(
    `SELECT timezone, week_starts_on, hidden_weekdays,
            default_block_start_minutes, default_block_end_minutes
     FROM tutors WHERE id = $1`,
    [tutorId],
  );
  const tutor = prefsResult.rows[0];
  if (!tutor) {
    throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
  }

  const { from, to } = zonedWeekRangeUtc(new Date(), tutor.timezone, tutor.week_starts_on);

  await topUpRecurringSchedules(tutorId);
  await topUpRecurringPersonalSchedules(tutorId);

  const [lessons, personal, overrides] = await Promise.all([
    query<{ start_utc: Date; duration_min: number }>(
      `SELECT start_utc, duration_min FROM lessons
       WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3
         AND status <> 'cancelled'`,
      [tutorId, from.toISOString(), to.toISOString()],
    ),
    query<Pick<PersonalEventRow, 'start_utc' | 'duration_min'>>(
      `SELECT start_utc, duration_min FROM personal_events
       WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3`,
      [tutorId, from.toISOString(), to.toISOString()],
    ),
    query<SlotOverrideRow>(
      `SELECT weekday, start_minutes, blocked
       FROM schedule_slot_overrides WHERE tutor_id = $1`,
      [tutorId],
    ),
  ]);

  const occupied = [
    ...lessons.rows.map((r) => ({ startUtc: r.start_utc, durationMin: r.duration_min })),
    ...personal.rows.map((r) => ({ startUtc: r.start_utc, durationMin: r.duration_min })),
  ];

  const days = computeOpenSlotsForWeek({
    timezone: tutor.timezone,
    weekStartsOn: tutor.week_starts_on,
    hiddenWeekdays: tutor.hidden_weekdays ?? [],
    blockWindow: {
      startMinutes: tutor.default_block_start_minutes,
      endMinutes: tutor.default_block_end_minutes,
    },
    overrides: overrides.rows,
    occupied,
  });

  return {
    timezone: tutor.timezone,
    weekStartsOn: tutor.week_starts_on,
    from: from.toISOString(),
    to: to.toISOString(),
    days,
  };
}
