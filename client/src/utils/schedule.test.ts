import { describe, expect, it } from 'vitest';
import type { Lesson, PersonalEvent } from '../api/types';
import { fmtWeekLabel } from './format';
import { occurrenceDateForSlot } from './recurrence';
import {
  lessonToView,
  personalEventToView,
  shiftWeek,
  slotToStartUtc,
  todayDayIndex,
  weekDates,
  weekRangeUtc,
} from './schedule';

const MOSCOW = 'Europe/Moscow';
const NY = 'America/New_York';
/** Monday 2026-08-31 (date-only week start). */
const WEEK_START = new Date(Date.UTC(2026, 7, 31));

function stubLesson(startUtc: string): Lesson {
  return {
    id: 'l1',
    tutorId: 't1',
    studentId: 's1',
    startUtc,
    durationMin: 60,
    academicUnits: 1,
    status: 'planned',
    type: 'solo',
    paid: false,
    notes: null,
    balanceCharged: false,
    chargeDebtDelta: 0,
    balancePaidApplied: false,
    recurringScheduleId: null,
    createdAt: startUtc,
    updatedAt: startUtc,
  };
}

function stubEvent(startUtc: string): PersonalEvent {
  return {
    id: 'e1',
    tutorId: 't1',
    groupId: 'g1',
    title: 'Gym',
    startUtc,
    durationMin: 60,
    notes: null,
    recurringPersonalScheduleId: null,
    createdAt: startUtc,
    updatedAt: startUtc,
  };
}

function roundTrip(day: number, startHours: number, timezone: string) {
  const startUtc = slotToStartUtc(WEEK_START, day, startHours, timezone);
  return lessonToView(stubLesson(startUtc), WEEK_START, timezone);
}

describe('schedule timezone grid', () => {
  it('keeps a Moscow Tuesday 1:00 drop on Tuesday (not Monday)', () => {
    const view = roundTrip(1, 1, MOSCOW);
    expect(view.day).toBe(1);
    expect(view.start).toBe(1);
    expect(view.startUtc).toBe('2026-08-31T22:00:00.000Z');
  });

  it('keeps Moscow early-morning hours 00:00–02:59 on the dropped day', () => {
    for (const hour of [0, 1, 2, 2 + 59 / 60]) {
      const view = roundTrip(1, hour, MOSCOW);
      expect(view.day).toBe(1);
      expect(view.start).toBeCloseTo(hour, 5);
    }
  });

  it('still places Moscow Tuesday 4:00 and 9:00 on Tuesday', () => {
    expect(roundTrip(1, 4, MOSCOW).day).toBe(1);
    expect(roundTrip(1, 9, MOSCOW).day).toBe(1);
  });

  it('keeps a New York Tuesday 23:00 drop on Tuesday (not Wednesday)', () => {
    const view = roundTrip(1, 23, NY);
    expect(view.day).toBe(1);
    expect(view.start).toBe(23);
  });

  it('maps personal events with the same calendar-day index', () => {
    const startUtc = slotToStartUtc(WEEK_START, 1, 1, MOSCOW);
    const view = personalEventToView(stubEvent(startUtc), WEEK_START, MOSCOW);
    expect(view.day).toBe(1);
    expect(view.start).toBe(1);
  });

  it('uses calendar dates for week column numbers in any timezone', () => {
    expect(weekDates(WEEK_START, MOSCOW)).toEqual([31, 1, 2, 3, 4, 5, 6]);
    expect(weekDates(WEEK_START, NY)).toEqual([31, 1, 2, 3, 4, 5, 6]);
  });

  it('treats Monday 01:00 Moscow as this week, not the previous UTC week', () => {
    const now = new Date('2026-08-31T01:00:00+03:00');
    const { from, to, weekStart } = weekRangeUtc(now, 'monday', MOSCOW);
    expect(weekStart.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    const monday1am = slotToStartUtc(weekStart, 0, 1, MOSCOW);
    expect(monday1am).toBe('2026-08-30T22:00:00.000Z');
    expect(monday1am >= from && monday1am < to).toBe(true);
  });

  it('keeps date-only week navigation on the calendar week in a negative offset', () => {
    const { weekStart } = weekRangeUtc(new Date('2026-09-02T12:00:00+03:00'), 'monday', MOSCOW);
    const next = shiftWeek(weekStart, 1);
    const { weekStart: nextStart } = weekRangeUtc(next, 'monday', NY);
    expect(nextStart.toISOString()).toBe(next.toISOString());
    expect(nextStart.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('resolves today column from local date, including Monday 01:00 Moscow', () => {
    expect(todayDayIndex(WEEK_START, MOSCOW, new Date('2026-08-31T01:00:00+03:00'))).toBe(0);
    expect(todayDayIndex(WEEK_START, MOSCOW, new Date('2026-09-01T01:00:00+03:00'))).toBe(1);
  });

  it('labels the week from the calendar date, not the UTC instant in local TZ', () => {
    expect(fmtWeekLabel(WEEK_START)).toBe('31 авг – 6 сен');
  });

  it('picks occurrence dates from the calendar week, not zoned UTC midnight', () => {
    expect(occurrenceDateForSlot(WEEK_START, 1)).toBe('2026-09-01');
  });
});
