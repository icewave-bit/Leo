import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  analyticsCustomFromAtom,
  analyticsCustomToAtom,
  analyticsErrorAtom,
  analyticsLessonsAtom,
  analyticsLoadingAtom,
  analyticsMovementsAtom,
  analyticsPeriodAtom,
  analyticsStudentIdAtom,
} from '../atoms/analytics';
import { periodRange } from '../utils/paymentJournal';

export async function loadAnalytics(get: Getter, set: Setter): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  const period = get(analyticsPeriodAtom);
  const studentId = get(analyticsStudentIdAtom);
  const customFrom = get(analyticsCustomFromAtom);
  const customTo = get(analyticsCustomToAtom);
  const { from, to } = periodRange(period, tutor.timezone, {
    from: customFrom,
    to: customTo,
  });

  set(analyticsLoadingAtom, true);
  set(analyticsErrorAtom, null);
  try {
    const sid = studentId ?? undefined;
    const [lessons, movements] = await Promise.all([
      api.lessons(from, to, sid),
      api.balanceMovements(from, to, sid),
    ]);
    set(analyticsLessonsAtom, lessons);
    set(analyticsMovementsAtom, movements);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить аналитику';
    set(analyticsErrorAtom, message);
    set(analyticsLessonsAtom, []);
    set(analyticsMovementsAtom, []);
  } finally {
    set(analyticsLoadingAtom, false);
  }
}
