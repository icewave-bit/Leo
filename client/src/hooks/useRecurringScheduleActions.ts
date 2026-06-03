import { useSetAtom } from 'jotai';
import type { AcademicUnits, LessonType, RecurrenceConfig } from '../api/types';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { recurringSchedulesAtom, weekStartAtom } from '../atoms/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { minutesFromHours, resolveRecurrenceStartDate } from '../utils/recurrence';
import { useAppStore } from './useAppStore';

export function useRecurringScheduleActions() {
  const setRecurring = useSetAtom(recurringSchedulesAtom);
  const store = useAppStore();

  const reload = async () => {
    await loadSchedule(store.get, store.set);
  };

  const createRecurringSchedule = async (params: {
    studentId: string;
    day: number;
    start: number;
    academicUnits: AcademicUnits;
    type: LessonType;
    notes: string | null;
    recurrence: RecurrenceConfig;
  }) => {
    const tutor = store.get(tutorAtom);
    const weekStart = store.get(weekStartAtom);
    const timezone = tutor?.timezone ?? 'UTC';
    const startDate = resolveRecurrenceStartDate(
      weekStart,
      params.recurrence.weekdays,
      timezone,
    );

    const schedule = await api.createRecurringSchedule({
      studentId: params.studentId,
      weekdays: params.recurrence.weekdays,
      startMinutes: minutesFromHours(params.start),
      academicUnits: params.academicUnits,
      type: params.type,
      notes: params.notes,
      intervalWeeks: params.recurrence.intervalWeeks,
      startDate,
      endDate: params.recurrence.endDate,
    });

    setRecurring((prev) => [...prev, schedule].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    await reload();
    return schedule;
  };

  const deleteRecurringSchedule = async (scheduleId: string, fromLessonId: string) => {
    setRecurring((prev) => prev.filter((s) => s.id !== scheduleId));
    await api.deleteRecurringSchedule(scheduleId, fromLessonId);
    await reload();
  };

  return { createRecurringSchedule, deleteRecurringSchedule };
}
