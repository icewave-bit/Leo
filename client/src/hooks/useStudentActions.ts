import { useSetAtom } from 'jotai';
import type { CreateStudentBody, UpdateStudentBody } from '../api/types';
import { api } from '../api/client';
import { archivedStudentsAtom } from '../atoms/archivedStudents';
import { studentLessonsBumpAtom, studentsAtom } from '../atoms/schedule';
import { reloadStudents } from '../state/reloadStudents';
import { studentToView } from '../utils/schedule';
import { useAppStore } from './useAppStore';

export function useStudentActions() {
  const setStudents = useSetAtom(studentsAtom);
  const setArchivedStudents = useSetAtom(archivedStudentsAtom);
  const bumpLessons = useSetAtom(studentLessonsBumpAtom);
  const store = useAppStore();

  const refresh = async () => {
    await reloadStudents(store.get, store.set);
  };

  const createStudent = async (body: CreateStudentBody): Promise<string> => {
    const student = await api.createStudent(body);
    const view = studentToView(student);
    setStudents((prev) => [...prev, view].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    return student.id;
  };

  const updateStudent = async (id: string, body: UpdateStudentBody): Promise<void> => {
    const student = await api.updateStudent(id, body);
    const view = studentToView(student);
    setStudents((prev) => prev.map((s) => (s.id === id ? view : s)));
  };

  const replenishBalance = async (id: string, amount: number): Promise<void> => {
    const current = store.get(studentsAtom).find((s) => s.id === id);
    if (!current) throw new Error('Ученик не найден');
    const prepaid =
      current.balanceKind === 'lessons'
        ? current.prepaid + Math.round(amount)
        : current.prepaid + amount;
    await updateStudent(id, { prepaid });
    bumpLessons((n) => n + 1);
  };

  const archiveStudent = async (id: string): Promise<void> => {
    const student = await api.archiveStudent(id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setArchivedStudents((prev) => {
      const view = studentToView(student);
      return [view, ...prev.filter((s) => s.id !== id)];
    });
  };

  const restoreStudent = async (id: string): Promise<void> => {
    const student = await api.restoreStudent(id);
    const view = studentToView(student);
    setStudents((prev) => [...prev, view].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    setArchivedStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const deleteStudent = async (id: string): Promise<void> => {
    await api.deleteStudent(id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setArchivedStudents((prev) => prev.filter((s) => s.id !== id));
  };

  return {
    createStudent,
    updateStudent,
    archiveStudent,
    restoreStudent,
    deleteStudent,
    replenishBalance,
    refresh,
  };
}
