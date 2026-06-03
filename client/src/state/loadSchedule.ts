import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  lessonsAtom,
  recurringSchedulesAtom,
  scheduleLoadErrorAtom,
  scheduleLoadingAtom,
  studentsAtom,
  weekStartAtom,
} from '../atoms/schedule';
import { lessonToView, studentToView, weekRangeUtc } from '../utils/schedule';

export async function loadSchedule(get: Getter, set: Setter): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  set(scheduleLoadingAtom, true);
  set(scheduleLoadErrorAtom, null);
  try {
    const weekStartsOn = tutor.weekStartsOn ?? 'monday';
    const anchor = get(weekStartAtom);
    const { from, to, weekStart } = weekRangeUtc(anchor, weekStartsOn);
    set(weekStartAtom, weekStart);
    // Lessons first: GET /lessons runs auto-complete + balance charge before we read students.
    // Lessons first: GET /lessons runs auto-complete, recurring top-up, then we read students.
    const lessons = await api.lessons(from, to);
    const [students, recurringSchedules] = await Promise.all([
      api.students(),
      api.recurringSchedules(),
    ]);
    set(
      studentsAtom,
      students.map(studentToView),
    );
    set(recurringSchedulesAtom, recurringSchedules);
    set(
      lessonsAtom,
      lessons.map((l) => lessonToView(l, weekStart, tutor.timezone)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить расписание';
    set(scheduleLoadErrorAtom, message);
    if (/401|Authentication required/i.test(message)) {
      set(tutorAtom, null);
    }
    throw err;
  } finally {
    set(scheduleLoadingAtom, false);
  }
}
