import { describe, expect, it } from 'vitest';
import { startUtcForOccurrence } from '../recurringSchedule.js';
import {
  dateKeyInTz,
  slotToStartUtc,
  weekdayIndexInWeek,
  zonedWeekRangeUtc,
} from '../scheduleSlots.js';

const MOSCOW = 'Europe/Moscow';
const NY = 'America/New_York';
const WEEK_START = new Date(Date.UTC(2026, 7, 31));

describe('scheduleSlots timezone', () => {
  it('converts Tuesday 1:00 Moscow to the previous UTC calendar date without changing local day', () => {
    const iso = slotToStartUtc(WEEK_START, 1, 1, MOSCOW);
    expect(iso).toBe('2026-08-31T22:00:00.000Z');
    expect(dateKeyInTz(new Date(iso), MOSCOW)).toBe('2026-09-01');
    expect(weekdayIndexInWeek(new Date(iso), WEEK_START, MOSCOW)).toBe(1);
  });

  it('converts Tuesday 23:00 New York without slipping into Wednesday', () => {
    const iso = slotToStartUtc(WEEK_START, 1, 23, NY);
    expect(dateKeyInTz(new Date(iso), NY)).toBe('2026-09-01');
    expect(weekdayIndexInWeek(new Date(iso), WEEK_START, NY)).toBe(1);
  });

  it('includes Monday 01:00 Moscow in the zoned week fetch window', () => {
    const now = new Date('2026-08-31T01:00:00+03:00');
    const { from, to } = zonedWeekRangeUtc(now, MOSCOW, 'monday');
    expect(from.toISOString()).toBe('2026-08-30T21:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-06T21:00:00.000Z');
    const monday1am = slotToStartUtc(WEEK_START, 0, 1, MOSCOW);
    expect(monday1am >= from.toISOString() && monday1am < to.toISOString()).toBe(true);
  });

  it('does not treat Monday 01:00 Moscow as the previous UTC week', () => {
    const now = new Date('2026-08-31T01:00:00+03:00');
    const { from } = zonedWeekRangeUtc(now, MOSCOW, 'monday');
    expect(dateKeyInTz(from, MOSCOW)).toBe('2026-08-31');
  });

  it('builds recurring occurrence UTC from the local wall clock on that date', () => {
    const iso = startUtcForOccurrence(
      '2026-09-01',
      { start_minutes: 60 },
      { timezone: MOSCOW, week_starts_on: 'monday' },
    );
    expect(iso).toBe('2026-08-31T22:00:00.000Z');
  });
});
