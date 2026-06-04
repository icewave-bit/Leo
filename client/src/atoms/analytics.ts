import { atom } from 'jotai';
import type { BalanceMovement, Lesson } from '../api/types';
import type { PaymentsPeriod } from './payments';

export type AnalyticsPeriod = PaymentsPeriod;

/** null = all students */
export const analyticsStudentIdAtom = atom<string | null>(null);
export const analyticsPeriodAtom = atom<AnalyticsPeriod>('month');
/** YYYY-MM-DD in tutor timezone */
export const analyticsCustomFromAtom = atom<string>('');
export const analyticsCustomToAtom = atom<string>('');
export const analyticsLessonsAtom = atom<Lesson[]>([]);
export const analyticsMovementsAtom = atom<BalanceMovement[]>([]);
export const analyticsLoadingAtom = atom(false);
export const analyticsErrorAtom = atom<string | null>(null);
