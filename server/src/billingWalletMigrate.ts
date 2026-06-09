import type { PoolClient } from 'pg';
import { recordBalanceMovement } from './balanceMovements.js';
import { roundMoney } from './taxReplenishments.js';
import type { BalanceKind } from './types.js';

export interface WalletSnapshot {
  id: string;
  prepaid: number;
  debt: number;
  balanceKind: BalanceKind;
  rate: number | null;
}

function amountToMoney(amount: number, kind: BalanceKind, rate: number | null): number {
  if (kind === 'money') return amount;
  if (rate != null && rate > 0) return roundMoney(amount * rate);
  return amount;
}

function moneyToPayerUnits(money: number, kind: BalanceKind, rate: number | null): number {
  if (kind === 'money') return roundMoney(money);
  if (rate != null && rate > 0) return money / rate;
  return money;
}

export function convertAmountToPayerUnits(
  amount: number,
  fromKind: BalanceKind,
  fromRate: number | null,
  payerKind: BalanceKind,
  payerRate: number | null,
): number {
  if (amount === 0) return 0;
  const money = amountToMoney(amount, fromKind, fromRate);
  return moneyToPayerUnits(money, payerKind, payerRate);
}

async function loadPayerWallet(
  client: PoolClient,
  payerId: string,
): Promise<{ balance_kind: BalanceKind; prepaid: string; debt: string; rate: string | null }> {
  const result = await client.query<{
    balance_kind: BalanceKind;
    prepaid: string;
    debt: string;
    rate: string | null;
  }>(
    `SELECT balance_kind, prepaid, debt, rate FROM students WHERE id = $1 FOR UPDATE`,
    [payerId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Billing payer not found');
  return row;
}

/** Move dependent wallet onto payer when linking a shared billing account. */
export async function migrateDependentWalletToPayer(
  client: PoolClient,
  dependent: WalletSnapshot,
  payerId: string,
): Promise<void> {
  if (dependent.prepaid === 0 && dependent.debt === 0) return;

  const payer = await loadPayerWallet(client, payerId);
  const payerRate = payer.rate !== null ? Number(payer.rate) : null;

  const prepaidAdd = convertAmountToPayerUnits(
    dependent.prepaid,
    dependent.balanceKind,
    dependent.rate,
    payer.balance_kind,
    payerRate,
  );
  const debtAdd = convertAmountToPayerUnits(
    dependent.debt,
    dependent.balanceKind,
    dependent.rate,
    payer.balance_kind,
    payerRate,
  );

  if (prepaidAdd === 0 && debtAdd === 0) return;

  await client.query(
    `UPDATE students SET prepaid = prepaid + $1, debt = debt + $2 WHERE id = $3`,
    [prepaidAdd, debtAdd, payerId],
  );

  await recordBalanceMovement(client, {
    studentId: payerId,
    chargedForStudentId: dependent.id,
    kind: 'manual',
    prepaidDelta: prepaidAdd,
    debtDelta: debtAdd,
  });
}
