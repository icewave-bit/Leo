import type { PoolClient } from 'pg';
import type { BalanceKind } from './types.js';

export type BalanceMovementKind =
  | 'replenish'
  | 'manual'
  | 'lesson_charge'
  | 'lesson_paid'
  | 'lesson_reverse';

export async function recordBalanceMovement(
  client: PoolClient,
  input: {
    studentId: string;
    lessonId?: string | null;
    occurredAt?: Date;
    /** YYYY-MM-DD — фактическая дата поступления средств */
    receivedOn?: string;
    kind: BalanceMovementKind;
    prepaidDelta: number;
    debtDelta: number;
    /** Override movement kind classification (e.g. balance-kind switch → manual). */
    forceKind?: BalanceMovementKind;
  },
): Promise<void> {
  const snap = await client.query<{
    prepaid: string;
    debt: string;
    tutor_id: string;
    balance_kind: BalanceKind;
  }>(
    `SELECT prepaid, debt, tutor_id, balance_kind FROM students WHERE id = $1`,
    [input.studentId],
  );
  const row = snap.rows[0];
  if (!row) return;

  await client.query(
    `INSERT INTO balance_movements (
       tutor_id, student_id, lesson_id, occurred_at, received_on, kind,
       prepaid_delta, debt_delta, prepaid_after, debt_after, balance_kind
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      row.tutor_id,
      input.studentId,
      input.lessonId ?? null,
      (input.occurredAt ?? new Date()).toISOString(),
      input.receivedOn ?? null,
      input.forceKind ?? input.kind,
      input.prepaidDelta,
      input.debtDelta,
      Number(row.prepaid),
      Number(row.debt),
      row.balance_kind,
    ],
  );
}

export async function recordStudentBalancePatch(
  client: PoolClient,
  studentId: string,
  prepaidBefore: number,
  debtBefore: number,
  prepaidAfter: number,
  debtAfter: number,
  opts?: {
    balanceKindChanged?: boolean;
    prepaidTopUp?: boolean;
    receivedOn?: string;
  },
): Promise<void> {
  // Unit conversion (lessons ↔ money) rewrites stored amounts; not a real balance event.
  if (opts?.balanceKindChanged) return;

  const prepaidDelta = prepaidAfter - prepaidBefore;
  const debtDelta = debtAfter - debtBefore;
  if (Math.abs(prepaidDelta) < 1e-9 && Math.abs(debtDelta) < 1e-9) return;

  const kind: BalanceMovementKind =
    opts?.prepaidTopUp || (prepaidDelta > 0 && debtDelta <= 0)
      ? 'replenish'
      : 'manual';

  await recordBalanceMovement(client, {
    studentId,
    kind,
    prepaidDelta: prepaidAfter - prepaidBefore,
    debtDelta,
    receivedOn: opts?.receivedOn,
  });
}
