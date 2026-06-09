import type { BalanceKind, UpdateStudentBody } from '../api/types';
import type { ViewStudent } from './schedule';
import { partsFromBalanceNet } from './balanceConvert';
import { walletMoneyNet } from './walletCanonical';

export function patchForBalanceKind(
  student: ViewStudent,
  next: BalanceKind,
): UpdateStudentBody | null {
  if (next === student.balanceKind) return null;
  const rate = student.rate;
  if (rate == null || rate <= 0) return { balanceKind: next };

  const moneyNet = walletMoneyNet(
    student.prepaid,
    student.debt,
    student.balanceKind,
    rate,
  );
  const newNet = next === 'lessons' ? moneyNet / rate : moneyNet;
  const { prepaid, debt } = partsFromBalanceNet(newNet, next);
  return { balanceKind: next, prepaid, debt };
}
