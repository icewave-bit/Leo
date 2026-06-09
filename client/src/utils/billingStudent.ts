import type { ViewStudent } from './schedule';

export function isBillingDependent(
  student: Pick<ViewStudent, 'billingStudentId'>,
): boolean {
  return student.billingStudentId != null;
}

export function billingPayerId(student: Pick<ViewStudent, 'id' | 'billingStudentId'>): string {
  return student.billingStudentId ?? student.id;
}

export function findBillingPayer(
  students: ViewStudent[],
  student: Pick<ViewStudent, 'id' | 'billingStudentId'>,
): ViewStudent | undefined {
  const payerId = billingPayerId(student);
  return students.find((s) => s.id === payerId);
}

export function billingDependents(
  students: ViewStudent[],
  payerId: string,
): ViewStudent[] {
  return students.filter((s) => s.billingStudentId === payerId);
}

export function billingPayerOptions(
  students: ViewStudent[],
  excludeId?: string,
  forStudent?: Pick<ViewStudent, 'currency'>,
): ViewStudent[] {
  return students.filter(
    (s) =>
      s.id !== excludeId &&
      !s.group &&
      !s.billingStudentId &&
      !s.archivedAt &&
      (forStudent == null || billingPayerCompatible(forStudent, s)),
  );
}

export function billingPayerCompatible(
  student: Pick<ViewStudent, 'currency'>,
  payer: Pick<ViewStudent, 'currency'>,
): boolean {
  return student.currency === payer.currency;
}

export function billingLinkError(
  student: Pick<ViewStudent, 'currency'>,
  payer: Pick<ViewStudent, 'currency'>,
): string | null {
  if (student.currency !== payer.currency) {
    return `У плательщика валюта ${payer.currency}, у этого ученика — ${student.currency}. Сначала измените валюту ученика или выберите другого плательщика.`;
  }
  return null;
}

export function dependentDebtLabel(
  student: Pick<ViewStudent, 'openLessonDebt' | 'balanceKind' | 'currency'>,
  payer: Pick<ViewStudent, 'name' | 'balanceKind' | 'currency'> | undefined,
  fmt: (amount: number, kind: ViewStudent['balanceKind'], currency: string) => string,
): string {
  const kind = payer?.balanceKind ?? student.balanceKind;
  const currency = payer?.currency ?? student.currency;
  if (student.openLessonDebt > 0) {
    return fmt(student.openLessonDebt, kind, currency);
  }
  return payer ? `через ${payer.name}` : '0';
}
