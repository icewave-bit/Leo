import { describe, it, expect } from 'vitest';
import {
  occurrenceDatesForSchedule,
  RECURRING_HORIZON_WEEKS,
  shiftWeekdays,
  weekdayIndexForDate,
} from '../recurringSchedule.js';
import { addDaysToDateOnly } from '../scheduleSlots.js';

const prefs = { timezone: 'UTC', week_starts_on: 'monday' as const };

describe('recurringSchedule', () => {
  it('generates weekly dates on multiple weekdays until end date', () => {
    const dates = occurrenceDatesForSchedule(
      {
        start_date: '2030-06-03',
        end_date: '2030-06-24',
        interval_weeks: 1,
        weekdays: [0, 2],
      },
      '2030-12-31',
      prefs,
    );
    expect(dates).toEqual([
      '2030-06-03',
      '2030-06-05',
      '2030-06-10',
      '2030-06-12',
      '2030-06-17',
      '2030-06-19',
      '2030-06-24',
    ]);
  });

  it('respects interval weeks', () => {
    const dates = occurrenceDatesForSchedule(
      {
        start_date: '2030-06-03',
        end_date: '2030-06-24',
        interval_weeks: 2,
        weekdays: [0],
      },
      '2030-12-31',
      prefs,
    );
    expect(dates).toEqual(['2030-06-03', '2030-06-17']);
  });

  it('respects horizon when no end date', () => {
    const start = '2030-06-03';
    const horizon = addDaysToDateOnly(start, RECURRING_HORIZON_WEEKS * 7);
    const dates = occurrenceDatesForSchedule(
      {
        start_date: start,
        end_date: null,
        interval_weeks: 1,
        weekdays: [0],
      },
      horizon,
      prefs,
    );
    expect(dates).toHaveLength(RECURRING_HORIZON_WEEKS + 1);
    expect(dates[0]).toBe(start);
  });

  it('shifts weekdays forward, backward, and wrapping Sunday/Monday', () => {
    expect(shiftWeekdays([1], 2)).toEqual([3]);
    expect(shiftWeekdays([3], -2)).toEqual([1]);
    expect(shiftWeekdays([6], 1)).toEqual([0]);
    expect(shiftWeekdays([0], -1)).toEqual([6]);
    expect(shiftWeekdays([0, 2], 1)).toEqual([1, 3]);
  });

  it('maps a date-only key to the tutor grid weekday', () => {
    expect(weekdayIndexForDate('2030-06-03', 'monday')).toBe(0);
    expect(weekdayIndexForDate('2030-06-06', 'monday')).toBe(3);
    expect(weekdayIndexForDate('2030-06-09', 'monday')).toBe(6);
  });
});
