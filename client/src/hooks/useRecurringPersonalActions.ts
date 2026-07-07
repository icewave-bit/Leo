import { useSetAtom } from 'jotai';
import type { RecurrenceConfig } from '../api/types';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { recurringPersonalSchedulesAtom, weekStartAtom } from '../atoms/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { minutesFromHours, resolveRecurrenceStartDate } from '../utils/recurrence';
import { useAppStore } from './useAppStore';

export function useRecurringPersonalActions() {
  const setRecurring = useSetAtom(recurringPersonalSchedulesAtom);
  const store = useAppStore();

  const reload = async () => {
    await loadSchedule(store.get, store.set);
  };

  const createRecurringPersonalSchedule = async (params: {
    groupId: string;
    title: string;
    day: number;
    start: number;
    durationMin: number;
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

    const schedule = await api.createRecurringPersonalSchedule({
      groupId: params.groupId,
      title: params.title,
      weekdays: params.recurrence.weekdays,
      startMinutes: minutesFromHours(params.start),
      durationMin: params.durationMin,
      notes: params.notes,
      intervalWeeks: params.recurrence.intervalWeeks,
      startDate,
      endDate: params.recurrence.endDate,
    });

    setRecurring((prev) =>
      [...prev, schedule].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    );
    await reload();
    return schedule;
  };

  const deleteRecurringPersonalSchedule = async (scheduleId: string, fromEventId: string) => {
    setRecurring((prev) => prev.filter((s) => s.id !== scheduleId));
    await api.deleteRecurringPersonalSchedule(scheduleId, fromEventId);
    await reload();
  };

  return { createRecurringPersonalSchedule, deleteRecurringPersonalSchedule };
}
