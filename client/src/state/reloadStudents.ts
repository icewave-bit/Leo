import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { studentsAtom } from '../atoms/schedule';
import { studentToView } from '../utils/schedule';

export async function reloadStudents(get: Getter, set: Setter): Promise<void> {
  if (!get(tutorAtom)) return;
  const students = await api.students();
  set(studentsAtom, students.map(studentToView));
}
