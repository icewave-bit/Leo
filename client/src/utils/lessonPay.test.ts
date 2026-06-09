import { describe, it, expect } from 'vitest';
import { payToggleLabel, plannedPayPreview } from './lessonPay';
import { stubStudent } from './testFixtures';
import type { ViewLesson } from './schedule';

function plannedLesson(): ViewLesson {
  return {
    id: 'lesson-1',
    studentId: 'child-1',
    startUtc: new Date(Date.now() + 3_600_000).toISOString(),
    durationMin: 60,
    day: 0,
    start: 10,
    dur: 1,
    academicUnits: 1,
    status: 'planned',
    paid: false,
    balanceCharged: false,
    chargeDebtDelta: 0,
    balancePaidApplied: false,
    recurringScheduleId: null,
    type: 'solo',
    notes: null,
  };
}

describe('lessonPay family billing', () => {
  const payer = stubStudent({
    id: 'payer-1',
    name: 'Nastya',
    prepaid: 100,
    debt: 0,
    rate: 20,
    balanceKind: 'money',
  });
  const child = stubStudent({
    id: 'child-1',
    name: 'Sancho',
    prepaid: 0,
    debt: 0,
    rate: 20,
    billingStudentId: payer.id,
  });

  it('plannedPayPreview uses payer wallet when provided', () => {
    const withoutPayer = plannedPayPreview(child, 1);
    const withPayer = plannedPayPreview(child, 1, payer);
    expect(withoutPayer?.paid).toBe(false);
    expect(withPayer?.paid).toBe(true);
  });

  it('payToggleLabel uses payer wallet for planned lessons', () => {
    const lesson = plannedLesson();
    const labelAlone = payToggleLabel(lesson, child);
    const labelFamily = payToggleLabel(lesson, child, payer);
    expect(labelAlone).toMatch(/будет долг/i);
    expect(labelFamily).toMatch(/хватит уроков/i);
  });
});
