import { describe, expect, it } from 'vitest';
import type { BalanceMovement } from '../api/types';
import { fmtBalanceAmount } from './format';
import type { ViewStudent } from './schedule';
import { buildJournalRows } from './paymentJournal';

function student(partial: Partial<ViewStudent> & Pick<ViewStudent, 'id' | 'name'>): ViewStudent {
  return {
    initials: partial.name.slice(0, 1),
    hue: 200,
    tz: 'Europe/Moscow',
    rate: 1333,
    currency: 'EUR',
    meet: null,
    note: null,
    group: false,
    members: [],
    balanceKind: 'money',
    prepaid: 0,
    debt: 0,
    excludeFromTaxes: false,
    billingStudentId: null,
    openLessonDebt: 0,
    telegramLinked: false,
    telegramUsername: null,
    ...partial,
  };
}

function movement(
  partial: Partial<BalanceMovement> & Pick<BalanceMovement, 'id' | 'kind'>,
): BalanceMovement {
  return {
    studentId: 'payer',
    chargedForStudentId: null,
    lessonId: null,
    occurredAt: '2026-03-01T12:00:00.000Z',
    prepaidDelta: 0,
    debtDelta: 0,
    prepaidAfter: 0,
    debtAfter: 0,
    balanceKind: 'money',
    parentMovementId: null,
    ...partial,
  };
}

describe('buildJournalRows', () => {
  const students = new Map<string, ViewStudent>([
    ['payer', student({ id: 'payer', name: 'C' })],
    ['a', student({ id: 'a', name: 'A', billingStudentId: 'payer' })],
    ['b', student({ id: 'b', name: 'B', billingStudentId: 'payer' })],
  ]);

  it('groups replenish children into Пополнение — Списание with allocations', () => {
    const replenishId = 'rep-1';
    const movements: BalanceMovement[] = [
      movement({
        id: replenishId,
        kind: 'replenish',
        prepaidDelta: 4000,
        prepaidAfter: 4000,
        occurredAt: '2026-03-01T12:00:00.000Z',
      }),
      movement({
        id: 'paid-1',
        kind: 'lesson_paid',
        parentMovementId: replenishId,
        chargedForStudentId: null,
        prepaidDelta: -1333,
        debtDelta: -1333,
        prepaidAfter: 2667,
        debtAfter: 2667,
        lessonId: 'l1',
        occurredAt: '2026-03-01T12:00:01.000Z',
      }),
      movement({
        id: 'paid-2',
        kind: 'lesson_paid',
        parentMovementId: replenishId,
        chargedForStudentId: 'a',
        prepaidDelta: -1333,
        debtDelta: -1333,
        prepaidAfter: 1334,
        debtAfter: 1334,
        lessonId: 'l2',
        occurredAt: '2026-03-01T12:00:02.000Z',
      }),
      movement({
        id: 'paid-3',
        kind: 'lesson_paid',
        parentMovementId: replenishId,
        chargedForStudentId: 'b',
        prepaidDelta: -1333,
        debtDelta: -1333,
        prepaidAfter: 1,
        debtAfter: 1,
        lessonId: 'l3',
        occurredAt: '2026-03-01T12:00:03.000Z',
      }),
    ];

    const rows = buildJournalRows(movements, students, 'Europe/Moscow');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(replenishId);
    expect(rows[0]!.title).toBe('Пополнение — Списание');
    expect(rows[0]!.isCompoundReplenish).toBe(true);
    expect(rows[0]!.allocations).toHaveLength(4);
    expect(rows[0]!.allocations!.map((a) => a.title)).toEqual([
      'Оплата урока',
      'Оплата урока · A',
      'Оплата урока · B',
      'Остаток на балансе',
    ]);
    const lessonAmt = fmtBalanceAmount(1333, 'money', 'EUR');
    expect(rows[0]!.allocations!.map((a) => a.amountLabel)).toEqual([
      lessonAmt,
      lessonAmt,
      lessonAmt,
      fmtBalanceAmount(1, 'money', 'EUR'),
    ]);
    expect(rows.map((r) => r.id)).not.toContain('paid-1');
  });

  it('keeps plain replenish title when there are no children', () => {
    const movements: BalanceMovement[] = [
      movement({
        id: 'rep-clean',
        kind: 'replenish',
        prepaidDelta: 2000,
        prepaidAfter: 2000,
      }),
    ];

    const rows = buildJournalRows(movements, students, 'Europe/Moscow');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Пополнение');
    expect(rows[0]!.isCompoundReplenish).toBeFalsy();
    expect(rows[0]!.allocations).toBeUndefined();
  });
});
