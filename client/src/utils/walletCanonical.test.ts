import { describe, it, expect } from 'vitest';
import { storedWalletNet, walletMoneyNet } from './walletCanonical';

describe('walletCanonical', () => {
  it('storedWalletNet does not change when rate changes (lessons storage)', () => {
    const prepaid = 10;
    const debt = 3;
    expect(storedWalletNet(prepaid, debt, 'lessons')).toBe(7);
    expect(storedWalletNet(prepaid, debt, 'lessons')).toBe(7);
  });

  it('storedWalletNet is stable for money storage regardless of rate arg', () => {
    expect(storedWalletNet(100, 20, 'money')).toBe(80);
    expect(walletMoneyNet(100, 20, 'money', 5)).toBe(80);
    expect(walletMoneyNet(100, 20, 'money', 50)).toBe(80);
  });

  it('walletMoneyNet for lessons storage follows current rate (informational)', () => {
    expect(walletMoneyNet(0, 3, 'lessons', 12)).toBe(-36);
    expect(walletMoneyNet(0, 3, 'lessons', 6)).toBe(-18);
  });
});
