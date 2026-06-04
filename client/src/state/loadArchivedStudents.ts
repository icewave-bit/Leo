import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { archivedStudentsAtom, archivedStudentsLoadingAtom } from '../atoms/archivedStudents';
import { studentToView } from '../utils/schedule';

export async function loadArchivedStudents(_get: Getter, set: Setter): Promise<void> {
  set(archivedStudentsLoadingAtom, true);
  try {
    const students = await api.archivedStudents();
    set(
      archivedStudentsAtom,
      students.map(studentToView),
    );
  } finally {
    set(archivedStudentsLoadingAtom, false);
  }
}
