import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOCK_WINDOW } from '../scheduleBlocks.js';
import { computeOpenSlotsForWeek, isHourOpen, wallEvent } from '../openSlots.js';

describe('isHourOpen', () => {
  it('blocks default night hours without override', () => {
    expect(isHourOpen(23, 0, false, [], DEFAULT_BLOCK_WINDOW)).toBe(false);
    expect(isHourOpen(7, 0, false, [], DEFAULT_BLOCK_WINDOW)).toBe(false);
    expect(isHourOpen(10, 0, false, [], DEFAULT_BLOCK_WINDOW)).toBe(true);
  });

  it('treats occupied hours as closed even in working day', () => {
    expect(isHourOpen(10, 0, true, [], DEFAULT_BLOCK_WINDOW)).toBe(false);
  });

  it('honors explicit unblock override when free', () => {
    expect(
      isHourOpen(23, 0, false, [{ weekday: 0, start_minutes: 23 * 60, blocked: false }], DEFAULT_BLOCK_WINDOW),
    ).toBe(true);
    expect(
      isHourOpen(23, 0, true, [{ weekday: 0, start_minutes: 23 * 60, blocked: false }], DEFAULT_BLOCK_WINDOW),
    ).toBe(false);
  });

  it('honors explicit block override', () => {
    expect(
      isHourOpen(10, 0, false, [{ weekday: 0, start_minutes: 10 * 60, blocked: true }], DEFAULT_BLOCK_WINDOW),
    ).toBe(false);
  });
});

describe('computeOpenSlotsForWeek', () => {
  it('excludes occupied and blocked hours and merges ranges', () => {
    // Fixed: Monday 2026-07-20 in UTC (week starts Monday).
    const now = new Date('2026-07-22T12:00:00Z');
    const days = computeOpenSlotsForWeek({
      now,
      timezone: 'UTC',
      weekStartsOn: 'monday',
      blockWindow: DEFAULT_BLOCK_WINDOW,
      overrides: [],
      occupied: [wallEvent('2026-07-20', 10, 60, 'UTC')],
    });

    const mon = days.find((d) => d.date === '2026-07-20');
    expect(mon).toBeTruthy();
    expect(mon!.ranges).toEqual([
      { startHour: 8, endHour: 10 },
      { startHour: 11, endHour: 22 },
    ]);
  });

  it('skips hidden weekdays', () => {
    const now = new Date('2026-07-22T12:00:00Z');
    const days = computeOpenSlotsForWeek({
      now,
      timezone: 'UTC',
      weekStartsOn: 'monday',
      hiddenWeekdays: [0],
      blockWindow: DEFAULT_BLOCK_WINDOW,
      overrides: [],
      occupied: [],
    });
    expect(days.some((d) => d.date === '2026-07-20')).toBe(false);
    expect(days.some((d) => d.date === '2026-07-21')).toBe(true);
  });
});
