import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { personalEventsAtom, weekStartAtom } from '../atoms/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { personalEventToView, slotToStartUtc } from '../utils/schedule';
import { useAppStore } from './useAppStore';

export function usePersonalEventActions() {
  const setPersonalEvents = useSetAtom(personalEventsAtom);
  const store = useAppStore();

  const reload = async () => {
    await loadSchedule(store.get, store.set);
  };

  const createPersonalEvent = async (params: {
    groupId: string;
    title: string;
    day: number;
    start: number;
    durationMin: number;
    notes: string | null;
  }): Promise<string> => {
    const weekStart = store.get(weekStartAtom);
    const tz = store.get(tutorAtom)?.timezone ?? 'UTC';
    const startUtc = slotToStartUtc(weekStart, params.day, params.start, tz);
    const event = await api.createPersonalEvent({
      groupId: params.groupId,
      title: params.title,
      startUtc,
      durationMin: params.durationMin,
      notes: params.notes,
    });
    const view = personalEventToView(event, weekStart, tz);
    setPersonalEvents((prev) =>
      [...prev, view].sort((a, b) => a.day - b.day || a.start - b.start),
    );
    return event.id;
  };

  const patchPersonalEvent = async (
    id: string,
    patch: {
      groupId?: string;
      title?: string;
      day?: number;
      start?: number;
      durationMin?: number;
      notes?: string | null;
    },
  ) => {
    const weekStart = store.get(weekStartAtom);
    const tz = store.get(tutorAtom)?.timezone ?? 'UTC';
    const body: Parameters<typeof api.patchPersonalEvent>[1] = {};
    if (patch.groupId !== undefined) body.groupId = patch.groupId;
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.durationMin !== undefined) body.durationMin = patch.durationMin;
    if (patch.notes !== undefined) body.notes = patch.notes;
    if (patch.day !== undefined && patch.start !== undefined) {
      body.startUtc = slotToStartUtc(weekStart, patch.day, patch.start, tz);
    }
    const updated = await api.patchPersonalEvent(id, body);
    const view = personalEventToView(updated, weekStart, tz);
    setPersonalEvents((prev) =>
      prev
        .map((e) => (e.id === id ? view : e))
        .sort((a, b) => a.day - b.day || a.start - b.start),
    );
    await reload();
  };

  const deletePersonalEvent = async (id: string) => {
    setPersonalEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await api.deletePersonalEvent(id);
      await reload();
    } catch {
      await reload();
      throw new Error('Не удалось удалить событие');
    }
  };

  return { createPersonalEvent, patchPersonalEvent, deletePersonalEvent };
}
