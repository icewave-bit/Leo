import type { ViewStudent } from './schedule';

export function stubStudent(overrides: Partial<ViewStudent> = {}): ViewStudent {
  return {
    id: 'student-1',
    name: 'Test',
    initials: 'T',
    hue: 200,
    tz: 'UTC',
    rate: 12,
    currency: 'USD',
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
    ...overrides,
  };
}
