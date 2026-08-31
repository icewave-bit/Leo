import { describe, expect, it } from 'vitest';
import type { TaxReplenishment } from '../api/types';
import { fmtBynNbrbTitle } from './taxDisplay';

function stubRow(patch: Partial<TaxReplenishment>): TaxReplenishment {
  return {
    movementId: 'm1',
    studentId: 's1',
    studentName: 'Ann',
    occurredAt: '2026-01-15T10:00:00.000Z',
    replenishmentDate: '2026-01-15',
    balanceKind: 'money',
    sourceAmount: 100,
    amount: 100,
    currency: 'EUR',
    amountByn: 325,
    nbrbRate: 3.25,
    nbrbScale: 1,
    conversionError: null,
    taxPaid: false,
    comment: '',
    ...patch,
  };
}

describe('fmtBynNbrbTitle', () => {
  it('shows conversion error when present', () => {
    expect(
      fmtBynNbrbTitle(
        stubRow({ conversionError: 'Нет курса НБРБ для EUR', nbrbRate: null }),
        '15/01/2026',
      ),
    ).toBe('Нет курса НБРБ для EUR');
  });

  it('shows date and official rate', () => {
    expect(fmtBynNbrbTitle(stubRow({}), '15/01/2026')).toBe('15/01/2026: 3,25');
  });

  it('shows official NBRB rate even when scale is not 1', () => {
    expect(
      fmtBynNbrbTitle(
        stubRow({ currency: 'RUB', nbrbRate: 3.5678, nbrbScale: 100, amountByn: 3.57 }),
        '15/01/2026',
      ),
    ).toBe('15/01/2026: 3,5678');
  });

  it('shows rate 1 for BYN', () => {
    expect(
      fmtBynNbrbTitle(
        stubRow({ currency: 'BYN', nbrbRate: 1, nbrbScale: 1, amountByn: 100 }),
        '15/01/2026',
      ),
    ).toBe('15/01/2026: 1,00');
  });
});
