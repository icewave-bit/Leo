import { query } from './db.js';
import type { BalanceKind } from './types.js';

export interface BillingDebtEntry {
  studentId: string;
  studentName: string;
  openDebt: number;
}

export interface BillingDebtBreakdown {
  payerId: string;
  payerName: string;
  balanceKind: BalanceKind;
  currency: string;
  walletPrepaid: number;
  walletDebt: number;
  entries: BillingDebtEntry[];
}

export async function loadBillingDebtBreakdown(
  tutorId: string,
  studentId: string,
): Promise<BillingDebtBreakdown | null> {
  const student = await query<{
    id: string;
    name: string;
    billing_student_id: string | null;
    balance_kind: BalanceKind;
    currency: string;
    prepaid: string;
    debt: string;
  }>(
    `SELECT id, name, billing_student_id, balance_kind, currency, prepaid, debt
     FROM students WHERE id = $1 AND tutor_id = $2`,
    [studentId, tutorId],
  );
  const row = student.rows[0];
  if (!row) return null;

  const payerId = row.billing_student_id ?? row.id;

  const payer = await query<{
    id: string;
    name: string;
    balance_kind: BalanceKind;
    currency: string;
    prepaid: string;
    debt: string;
  }>(
    `SELECT id, name, balance_kind, currency, prepaid, debt
     FROM students WHERE id = $1 AND tutor_id = $2`,
    [payerId, tutorId],
  );
  const payerRow = payer.rows[0];
  if (!payerRow) return null;

  const family = await query<{ id: string }>(
    `SELECT id FROM students
     WHERE tutor_id = $1 AND archived_at IS NULL
       AND (id = $2 OR billing_student_id = $2)`,
    [tutorId, payerId],
  );
  const familyIds = family.rows.map((r) => r.id);
  if (familyIds.length === 0) return null;

  const debts = await query<{
    student_id: string;
    student_name: string;
    open_debt: string;
  }>(
    `SELECT l.student_id, s.name AS student_name,
            SUM(l.charge_debt_delta)::text AS open_debt
     FROM lessons l
     JOIN students s ON s.id = l.student_id
     WHERE l.tutor_id = $1
       AND l.student_id = ANY($2::uuid[])
       AND l.balance_charged = true
       AND l.balance_paid_applied = false
       AND l.charge_debt_delta > 0
     GROUP BY l.student_id, s.name
     ORDER BY s.name`,
    [tutorId, familyIds],
  );

  return {
    payerId: payerRow.id,
    payerName: payerRow.name,
    balanceKind: payerRow.balance_kind,
    currency: payerRow.currency,
    walletPrepaid: Number(payerRow.prepaid),
    walletDebt: Number(payerRow.debt),
    entries: debts.rows.map((d) => ({
      studentId: d.student_id,
      studentName: d.student_name,
      openDebt: Number(d.open_debt),
    })),
  };
}

export async function loadOpenLessonDebts(
  tutorId: string,
  studentIds: string[],
): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();

  const result = await query<{ student_id: string; open_debt: string }>(
    `SELECT student_id, SUM(charge_debt_delta)::text AS open_debt
     FROM lessons
     WHERE tutor_id = $1
       AND student_id = ANY($2::uuid[])
       AND balance_charged = true
       AND balance_paid_applied = false
       AND charge_debt_delta > 0
     GROUP BY student_id`,
    [tutorId, studentIds],
  );

  return new Map(result.rows.map((r) => [r.student_id, Number(r.open_debt)]));
}
