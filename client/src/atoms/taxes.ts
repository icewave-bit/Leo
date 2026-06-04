import { atom } from 'jotai';
import type { TaxReplenishment } from '../api/types';

/** null = all students */
export const taxesStudentIdAtom = atom<string | null>(null);
/** YYYY-MM in tutor timezone */
export const taxesMonthAtom = atom<string>('');
export const taxReplenishmentsAtom = atom<TaxReplenishment[]>([]);
export const taxReplenishmentsLoadingAtom = atom(false);
export const taxReplenishmentsErrorAtom = atom<string | null>(null);
