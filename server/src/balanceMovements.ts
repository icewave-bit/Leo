import type { PoolClient } from 'pg';

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
    kind: BalanceMovementKind;
    prepaidDelta: number;
    debtDelta: number;
  },
): Promise<void> {
  const snap = await client.query<{ prepaid: string; debt: string; tutor_id: string }>(
    `SELECT prepaid, debt, tutor_id FROM students WHERE id = $1`,
    [input.studentId],
  );
  const row = snap.rows[0];
  if (!row) return;

  await client.query(
    `INSERT INTO balance_movements (
       tutor_id, student_id, lesson_id, occurred_at, kind,
       prepaid_delta, debt_delta, prepaid_after, debt_after
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.tutor_id,
      input.studentId,
      input.lessonId ?? null,
      (input.occurredAt ?? new Date()).toISOString(),
      input.kind,
      input.prepaidDelta,
      input.debtDelta,
      Number(row.prepaid),
      Number(row.debt),
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
): Promise<void> {
  const prepaidDelta = prepaidAfter - prepaidBefore;
  const debtDelta = debtAfter - debtBefore;
  if (Math.abs(prepaidDelta) < 1e-9 && Math.abs(debtDelta) < 1e-9) return;

  const prepaidOnlyDelta = prepaidAfter - prepaidBefore;
  const kind: BalanceMovementKind =
    prepaidOnlyDelta > 0 && debtDelta <= 0 ? 'replenish' : 'manual';

  await recordBalanceMovement(client, {
    studentId,
    kind,
    prepaidDelta: prepaidAfter - prepaidBefore,
    debtDelta,
  });
}
