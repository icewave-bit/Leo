import { atom } from 'jotai';
import type { TaxReplenishment } from '../api/types';
import { DEFAULT_TAXES_SORT, type TaxesSort } from '../utils/taxJournalSort';

export type TaxesPaidFilter = 'all' | 'paid' | 'unpaid';

/** null = all students */
export const taxesStudentIdAtom = atom<string | null>(null);
export const taxesPaidFilterAtom = atom<TaxesPaidFilter>('all');
export const taxesSortAtom = atom<TaxesSort>(DEFAULT_TAXES_SORT);
/** YYYY-MM in tutor timezone */
export const taxesMonthAtom = atom<string>('');
export const taxReplenishmentsAtom = atom<TaxReplenishment[]>([]);
export const taxReplenishmentsLoadingAtom = atom(false);
export const taxReplenishmentsErrorAtom = atom<string | null>(null);
