import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  balanceMovementsAtom,
  balanceMovementsErrorAtom,
  balanceMovementsLoadingAtom,
  paymentsCustomFromAtom,
  paymentsCustomToAtom,
  paymentsPeriodAtom,
  paymentsStudentIdAtom,
} from '../atoms/payments';
import { periodRange } from '../utils/paymentJournal';

export async function loadBalanceMovements(get: Getter, set: Setter): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  const period = get(paymentsPeriodAtom);
  const studentId = get(paymentsStudentIdAtom);
  const customFrom = get(paymentsCustomFromAtom);
  const customTo = get(paymentsCustomToAtom);
  const { from, to } = periodRange(
    period,
    tutor.timezone,
    { from: customFrom, to: customTo },
    new Date(),
    tutor.weekStartsOn,
  );

  set(balanceMovementsLoadingAtom, true);
  set(balanceMovementsErrorAtom, null);
  try {
    const rows = await api.balanceMovements(from, to, studentId ?? undefined);
    set(balanceMovementsAtom, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить журнал';
    set(balanceMovementsErrorAtom, message);
    set(balanceMovementsAtom, []);
  } finally {
    set(balanceMovementsLoadingAtom, false);
  }
}
