import { describe, it, expect } from 'vitest';
import { studentListBalanceLabel } from './studentBalanceDisplay';
import { stubStudent } from './testFixtures';

describe('studentListBalanceLabel', () => {
  const payer = stubStudent({
    id: 'payer-1',
    name: 'Nastya',
    balanceKind: 'lessons',
    prepaid: 0,
    debt: 0,
    rate: 12,
    currency: 'USD',
  });

  it('formats dependent openLessonDebt in payer balanceKind units', () => {
    const child = stubStudent({
      id: 'child-1',
      billingStudentId: payer.id,
      openLessonDebt: 2,
      balanceKind: 'money',
      currency: 'USD',
    });
    const label = studentListBalanceLabel(child, [payer, child], 'money');
    expect(label).toBe('2 урока');
  });

  it('shows stable lessons count when display mode is lessons', () => {
    const student = stubStudent({
      balanceKind: 'lessons',
      prepaid: 10,
      debt: 3,
      rate: 12,
    });
    expect(studentListBalanceLabel(student, [student], 'lessons')).toBe('+7 уроков');
    expect(studentListBalanceLabel(student, [student], 'lessons')).toBe('+7 уроков');
  });

  it('shows stable money when balance stored in money', () => {
    const student = stubStudent({
      balanceKind: 'money',
      prepaid: 100,
      debt: 20,
      rate: 5,
    });
    expect(studentListBalanceLabel(student, [student], 'money')).toContain('80');
    expect(studentListBalanceLabel(student, [student], 'money')).toContain('80');
  });
});
