import type { BalanceKind } from '../api/types';
import {
  findBillingPayer,
  isBillingDependent,
} from './billingStudent';
import { fmtBalanceAmount, lessonCountLabel } from './format';
import type { ViewStudent } from './schedule';
import { storedWalletNet, walletLessonsNet, walletMoneyNet } from './walletCanonical';

export type BalanceDisplayKind = BalanceKind;

function fmtSignedMoney(net: number, currency: string): string {
  if (net === 0) return fmtBalanceAmount(0, 'money', currency);
  const sign = net > 0 ? '+' : '−';
  return sign + fmtBalanceAmount(Math.abs(net), 'money', currency);
}

function fmtSignedLessons(net: number): string {
  if (net === 0) return lessonCountLabel(0);
  const sign = net > 0 ? '+' : '−';
  return sign + lessonCountLabel(Math.abs(net));
}

/** Единый формат баланса в списке учеников. Деньги — основа, уроки из денег. */
export function studentListBalanceLabel(
  student: ViewStudent,
  students: ViewStudent[],
  displayAs: BalanceDisplayKind,
): string {
  const dependent = isBillingDependent(student);
  const payer = dependent ? findBillingPayer(students, student) : undefined;
  const wallet = payer ?? student;
  const currency = wallet.currency;

  if (dependent) {
    if (student.openLessonDebt > 0) {
      return fmtBalanceAmount(student.openLessonDebt, wallet.balanceKind, currency);
    }
    return payer ? `через ${payer.name}` : '0';
  }

  if (displayAs === 'money') {
    if (wallet.balanceKind === 'money') {
      return fmtSignedMoney(storedWalletNet(wallet.prepaid, wallet.debt, wallet.balanceKind), currency);
    }
    const money = walletMoneyNet(
      wallet.prepaid,
      wallet.debt,
      wallet.balanceKind,
      wallet.rate,
    );
    return fmtSignedMoney(money, currency);
  }

  const lessons = walletLessonsNet(
    wallet.prepaid,
    wallet.debt,
    wallet.balanceKind,
    wallet.rate,
  );
  if (lessons == null) {
    return fmtSignedMoney(storedWalletNet(wallet.prepaid, wallet.debt, wallet.balanceKind), currency);
  }
  return fmtSignedLessons(lessons);
}
