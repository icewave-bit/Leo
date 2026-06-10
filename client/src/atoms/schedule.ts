import { atom } from 'jotai';
import type { BalanceKind } from '../api/types';
import type { RecurringSchedule } from '../api/types';
import type { LessonDraft, ViewLesson, ViewStudent } from '../utils/schedule';

export const studentsAtom = atom<ViewStudent[]>([]);
export const lessonsAtom = atom<ViewLesson[]>([]);
export const recurringSchedulesAtom = atom<RecurringSchedule[]>([]);
/** Normalized to tutor week start (Mon or Sun) on each schedule load. */
export const weekStartAtom = atom<Date>(new Date());
export const scheduleLoadingAtom = atom(false);
export const scheduleLoadErrorAtom = atom<string | null>(null);
export const selectedLessonIdAtom = atom<string | null>(null);
export const lessonDraftAtom = atom<LessonDraft | null>(null);
export const scheduleVariantAtom = atom<'week' | 'timeline' | 'agenda'>('week');
export const activeDayAtom = atom(0);
export const selectedStudentIdAtom = atom<string | null>(null);
export const studentDrawerModeAtom = atom<'create' | 'edit' | null>(null);
/** Student id when the balance replenish dialog is open. */
export const balanceReplenishStudentIdAtom = atom<string | null>(null);
/** Increment to refetch lesson lists after balance top-up. */
export const studentLessonsBumpAtom = atom(0);
/** Как показывать баланс в списке: деньги (основа) или уроки (из денег). */
export const studentsBalanceDisplayAtom = atom<BalanceKind>('money');
