import type { AcademicUnits } from '../api/types';
import { chargeAmount } from './lessonBalance';
import type { ViewLesson, ViewStudent } from './schedule';

export function studentNetBalance(student: ViewStudent): number {
  return student.prepaid - student.debt;
}

export function lessonChargeUnits(
  student: ViewStudent,
  academicUnits: AcademicUnits,
): number | null {
  if (student.group) return null;
  return chargeAmount(student.balanceKind, academicUnits, student.rate);
}

/** На балансе хватит уроков — после проведения спишется с предоплаты (деньги уже были). */
export function wouldCoverFromPrepaid(
  student: ViewStudent,
  academicUnits: AcademicUnits,
): boolean | null {
  const charge = lessonChargeUnits(student, academicUnits);
  if (charge == null) return null;
  return studentNetBalance(student) >= charge;
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
  student: ViewStudent,
  academicUnits: AcademicUnits,
): { paid: boolean; label: string } | null {
  const cover = wouldCoverFromPrepaid(student, academicUnits);
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

export function payToggleLabel(lesson: ViewLesson, student: ViewStudent): string {
  if (lesson.status === 'planned') {
    return plannedPayPreview(student, lesson.academicUnits)?.label ?? '—';
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
