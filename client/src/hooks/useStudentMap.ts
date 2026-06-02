import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { studentsAtom } from '../atoms/schedule';
import type { ViewStudent } from '../utils/schedule';

export function useStudentMap(): Map<string, ViewStudent> {
  const students = useAtomValue(studentsAtom);
  return useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
}

export function useStudent(id: string | undefined): ViewStudent | undefined {
  const map = useStudentMap();
  return id ? map.get(id) : undefined;
}
