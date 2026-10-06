import { useSetAtom } from 'jotai';
import type { Vacation } from '../api/types';
import { api } from '../api/client';
import { studentsAtom, vacationsAtom } from '../atoms/schedule';
import { loadSchedule } from '../state/loadSchedule';
import { useAppStore } from './useAppStore';

function upsertVacation(list: Vacation[], vacation: Vacation): Vacation[] {
  const without = list.filter((v) => v.id !== vacation.id);
  return [...without, vacation];
}

function studentVacationEmbed(vacation: Vacation) {
  if (!vacation.studentId || vacation.cancelledAt) return null;
  return {
    id: vacation.id,
    startDate: vacation.startDate,
    endDate: vacation.endDate,
  };
}

export function useVacationActions() {
  const setVacations = useSetAtom(vacationsAtom);
  const setStudents = useSetAtom(studentsAtom);
  const store = useAppStore();

  const reload = async () => {
    try {
      await loadSchedule(store.get, store.set);
    } catch {
      /* loadSchedule records the banner; the vacation request already succeeded */
    }
  };

  const syncStudentEmbed = (vacation: Vacation, embed: ReturnType<typeof studentVacationEmbed>) => {
    if (!vacation.studentId) return;
    const studentId = vacation.studentId;
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, vacation: embed } : s)),
    );
  };

  const createVacation = async (body: {
    studentId?: string | null;
    startDate: string;
    endDate: string;
    personalGroupIds?: string[];
  }): Promise<Vacation> => {
    const vacation = await api.createVacation(body);
    setVacations((prev) => upsertVacation(prev, vacation));
    syncStudentEmbed(vacation, studentVacationEmbed(vacation));
    await reload();
    return vacation;
  };

  const patchVacation = async (
    id: string,
    body: { startDate?: string; endDate?: string; personalGroupIds?: string[] },
  ): Promise<Vacation> => {
    const vacation = await api.patchVacation(id, body);
    setVacations((prev) => upsertVacation(prev, vacation));
    syncStudentEmbed(vacation, studentVacationEmbed(vacation));
    await reload();
    return vacation;
  };

  const returnFromVacation = async (id: string): Promise<Vacation> => {
    const vacation = await api.returnFromVacation(id);
    setVacations((prev) => prev.filter((v) => v.id !== id));
    if (vacation.studentId) {
      setStudents((prev) =>
        prev.map((s) => (s.id === vacation.studentId ? { ...s, vacation: null } : s)),
      );
    }
    await reload();
    return vacation;
  };

  return { createVacation, patchVacation, returnFromVacation };
}
