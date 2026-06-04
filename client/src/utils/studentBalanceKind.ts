import type { BalanceKind, UpdateStudentBody } from '../api/types';
import type { ViewStudent } from './schedule';
import {
  balanceNetFromParts,
  convertBalanceNet,
  partsFromBalanceNet,
} from './balanceConvert';

export function patchForBalanceKind(
  student: ViewStudent,
  next: BalanceKind,
): UpdateStudentBody | null {
  if (next === student.balanceKind) return null;
  const rate = student.rate;
  if (rate != null && rate > 0) {
    const netBal = balanceNetFromParts(student.prepaid, student.debt, student.balanceKind);
    const newNet = convertBalanceNet(netBal, student.balanceKind, next, rate);
    const { prepaid, debt } = partsFromBalanceNet(newNet, next);
    return { balanceKind: next, prepaid, debt };
  }
  return { balanceKind: next };
}
