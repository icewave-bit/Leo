import { describe, it, expect } from 'vitest';
import { convertAmountToPayerUnits } from '../billingWalletMigrate.js';

describe('convertAmountToPayerUnits', () => {
  it('converts lessons debt to payer money (Sancho −3 урока → $36)', () => {
    expect(convertAmountToPayerUnits(3, 'lessons', 12, 'money', 12)).toBe(36);
  });

  it('converts lessons debt to payer lessons at different rate', () => {
    expect(convertAmountToPayerUnits(3, 'lessons', 12, 'lessons', 6)).toBe(6);
  });

  it('keeps money amount for money payer', () => {
    expect(convertAmountToPayerUnits(36, 'money', 12, 'money', 5)).toBe(36);
  });

  it('converts money prepaid to payer lessons', () => {
    expect(convertAmountToPayerUnits(60, 'money', 12, 'lessons', 10)).toBe(6);
  });

  it('returns 0 for zero amount', () => {
    expect(convertAmountToPayerUnits(0, 'lessons', 12, 'money', 12)).toBe(0);
  });
});
