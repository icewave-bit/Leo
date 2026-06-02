import { useSetAtom } from 'jotai';
import type { AcademicUnits, LessonType } from '../api/types';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { lessonsAtom, weekStartAtom } from '../atoms/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { lessonToView, slotToStartUtc, toApiStatus, toUiStatus } from '../utils/schedule';
import type { UiLessonStatus, ViewLesson } from '../utils/schedule';
import { useAppStore } from './useAppStore';

export function useLessonActions() {
  const setLessons = useSetAtom(lessonsAtom);
  const store = useAppStore();

  const reload = async () => {
    await loadSchedule(store.get, store.set);
  };

  const patchLocal = (id: string, patch: Partial<ViewLesson>) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const setStatus = async (id: string, status: UiLessonStatus) => {
    patchLocal(id, { status });
    try {
      const updated = await api.patchLesson(id, { status: toApiStatus(status) });
      patchLocal(id, {
        status: toUiStatus(updated.status),
        balanceCharged: updated.balanceCharged,
      });
      await reload();
    } catch {
      await reload();
    }
  };

  const setPaid = async (id: string, paid: boolean) => {
    patchLocal(id, { paid });
    try {
      const updated = await api.patchLesson(id, { paid });
      patchLocal(id, { paid: updated.paid });
    } catch {
      await reload();
    }
  };

  const patchLessonLocal = (
    id: string,
    patch: Partial<Pick<ViewLesson, 'day' | 'start' | 'status' | 'paid'>>,
  ) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const rescheduleLesson = async (
    id: string,
    day: number,
    start: number,
    opts?: { restoreBalance?: boolean },
  ): Promise<void> => {
    const tutor = store.get(tutorAtom);
    const weekStart = store.get(weekStartAtom);
    const tz = tutor?.timezone ?? 'UTC';
    const startUtc = slotToStartUtc(weekStart, day, start, tz);

    patchLessonLocal(id, { day, start });
    try {
      const updated = await api.patchLesson(id, {
        startUtc,
        restoreBalance: opts?.restoreBalance,
      });
      const view = lessonToView(updated, weekStart, tz);
      setLessons((prev) =>
        prev
          .map((l) => (l.id === id ? view : l))
          .sort((a, b) => a.day - b.day || a.start - b.start),
      );
      await reload();
    } catch {
      await reload();
      throw new Error('Не удалось перенести урок');
    }
  };

  const deleteLesson = async (
    id: string,
    opts?: { restoreBalance?: boolean },
  ): Promise<void> => {
    setLessons((prev) => prev.filter((l) => l.id !== id));
    try {
      await api.deleteLesson(id, opts);
      await reload();
    } catch {
      await reload();
      throw new Error('Не удалось удалить урок');
    }
  };

  const createLesson = async (params: {
    studentId: string;
    day: number;
    start: number;
    academicUnits: AcademicUnits;
    type: LessonType;
    notes: string | null;
  }): Promise<string> => {
    const weekStart = store.get(weekStartAtom);
    const tz = store.get(tutorAtom)?.timezone ?? 'UTC';
    const startUtc = slotToStartUtc(weekStart, params.day, params.start, tz);
    const lesson = await api.createLesson({
      studentId: params.studentId,
      startUtc,
      academicUnits: params.academicUnits,
      type: params.type,
      notes: params.notes,
    });
    const view = lessonToView(lesson, weekStart, tz);
    setLessons((prev) =>
      [...prev, view].sort((a, b) => a.day - b.day || a.start - b.start),
    );
    return lesson.id;
  };

  return { setStatus, setPaid, createLesson, deleteLesson, rescheduleLesson };
}
