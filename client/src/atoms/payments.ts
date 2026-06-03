import { atom } from 'jotai';
import type { BalanceMovement } from '../api/types';

export type PaymentsPeriod = 'week' | 'month' | 'quarter' | 'all' | 'custom';

/** null = all students */
export const paymentsStudentIdAtom = atom<string | null>(null);
export const paymentsPeriodAtom = atom<PaymentsPeriod>('month');
/** YYYY-MM-DD in tutor timezone */
export const paymentsCustomFromAtom = atom<string>('');
export const paymentsCustomToAtom = atom<string>('');
export const balanceMovementsAtom = atom<BalanceMovement[]>([]);
export const balanceMovementsLoadingAtom = atom(false);
export const balanceMovementsErrorAtom = atom<string | null>(null);
