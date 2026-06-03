import { atom } from 'jotai';
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
export const themeAtom = atom<'light' | 'dark'>('light');
export const scheduleVariantAtom = atom<'week' | 'timeline' | 'agenda'>('week');
export const activeDayAtom = atom(0);
export const selectedStudentIdAtom = atom<string | null>(null);
export const studentDrawerModeAtom = atom<'create' | 'edit' | null>(null);
