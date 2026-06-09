import type { AcademicUnits } from '../api/types';
import { walletChargeAmount } from './lessonBalance';
import type { ViewLesson, ViewStudent } from './schedule';

export function studentNetBalance(student: ViewStudent): number {
  return student.prepaid - student.debt;
}

export function lessonChargeUnits(
  attendee: ViewStudent,
  academicUnits: AcademicUnits,
  walletHolder?: ViewStudent,
): number | null {
  if (attendee.group) return null;
  const wallet = walletHolder ?? attendee;
  return walletChargeAmount(
    wallet.balanceKind,
    wallet.rate,
    attendee.rate,
    academicUnits,
  );
}

/** На балансе хватит уроков — после проведения спишется с предоплаты (деньги уже были). */
export function wouldCoverFromPrepaid(
  attendee: ViewStudent,
  academicUnits: AcademicUnits,
  walletHolder?: ViewStudent,
): boolean | null {
  const wallet = walletHolder ?? attendee;
  const charge = lessonChargeUnits(attendee, academicUnits, wallet);
  if (charge == null) return null;
  return studentNetBalance(wallet) >= charge;
}

export function lessonHasOpenDebt(
  lesson: Pick<ViewLesson, 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied'>,
): boolean {
  return (
    lesson.balanceCharged &&
    !lesson.balancePaidApplied &&
    lesson.chargeDebtDelta > 0
  );
}

/** Зелёная галочка: проведён, списан, нет непогашенного долга по уроку. */
export function lessonDebtClosed(
  lesson: Pick<
    ViewLesson,
    'status' | 'paid' | 'balanceCharged' | 'chargeDebtDelta' | 'balancePaidApplied'
  >,
): boolean {
  if (lesson.status !== 'completed') return false;
  if (!lesson.balanceCharged) return false;
  return !lessonHasOpenDebt(lesson);
}

export function lessonPayToggleDisabled(status: ViewLesson['status']): boolean {
  return status === 'planned';
}

export function plannedPayPreview(
  attendee: ViewStudent,
  academicUnits: AcademicUnits,
  walletHolder?: ViewStudent,
): { paid: boolean; label: string } | null {
  const cover = wouldCoverFromPrepaid(attendee, academicUnits, walletHolder);
  if (cover == null) return null;
  if (cover) {
    return {
      paid: true,
      label: 'Оплачен — хватит уроков на балансе',
    };
  }
  return {
    paid: false,
    label: 'Не оплачен — будет долг',
  };
}

export function payToggleLabel(
  lesson: ViewLesson,
  student: ViewStudent,
  walletHolder?: ViewStudent,
): string {
  if (lesson.status === 'planned') {
    return plannedPayPreview(student, lesson.academicUnits, walletHolder)?.label ?? '—';
  }
  if (lesson.status === 'cancelled' || lesson.status === 'no-show') {
    return lesson.paid ? 'Списано с баланса' : 'Не списано';
  }
  return lesson.paid ? 'Оплачен' : 'Не оплачен';
}

export function completedPayHint(lesson: ViewLesson): string {
  if (lesson.paid) {
    return 'Оплачен — уроки на балансе или получена оплата';
  }
  return 'Урок в долг — отметьте, когда ученик заплатил';
}
