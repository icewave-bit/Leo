import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  lessonsAtom,
  recurringSchedulesAtom,
  scheduleLoadErrorAtom,
  scheduleLoadingAtom,
  studentLessonsBumpAtom,
  studentsAtom,
  weekStartAtom,
} from '../atoms/schedule';
import { lessonToView, studentToView, weekRangeUtc } from '../utils/schedule';

export type LoadScheduleOptions = {
  /** Week to load; defaults to current `weekStartAtom`. */
  anchor?: Date;
  /** Week navigation — only lessons; skip students and recurring schedules. */
  lessonsOnly?: boolean;
};

let loadScheduleSeq = 0;

function applyWeekLessons(
  get: Getter,
  set: Setter,
  weekStart: Date,
  lessons: Awaited<ReturnType<typeof api.lessons>>,
  timezone: string,
): void {
  const prevWeekStart = get(weekStartAtom);
  if (prevWeekStart.getTime() !== weekStart.getTime()) {
    set(weekStartAtom, weekStart);
  }
  set(
    lessonsAtom,
    lessons.map((l) => lessonToView(l, weekStart, timezone)),
  );
  set(studentLessonsBumpAtom, (n) => n + 1);
}

export async function loadSchedule(
  get: Getter,
  set: Setter,
  opts?: LoadScheduleOptions,
): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  const seq = ++loadScheduleSeq;
  set(scheduleLoadingAtom, true);
  set(scheduleLoadErrorAtom, null);
  try {
    const weekStartsOn = tutor.weekStartsOn ?? 'monday';
    const anchor = opts?.anchor ?? get(weekStartAtom);
    const { from, to, weekStart } = weekRangeUtc(anchor, weekStartsOn);
    // Lessons first: GET /lessons runs auto-complete + balance charge before we read students.
    const lessons = await api.lessons(from, to);
    if (seq !== loadScheduleSeq) return;

    if (opts?.lessonsOnly) {
      applyWeekLessons(get, set, weekStart, lessons, tutor.timezone);
      return;
    }

    const [students, recurringSchedules] = await Promise.all([
      api.students(),
      api.recurringSchedules(),
    ]);
    if (seq !== loadScheduleSeq) return;

    set(
      studentsAtom,
      students.map(studentToView),
    );
    set(recurringSchedulesAtom, recurringSchedules);
    applyWeekLessons(get, set, weekStart, lessons, tutor.timezone);
  } catch (err) {
    if (seq !== loadScheduleSeq) return;
    const message = err instanceof Error ? err.message : 'Не удалось загрузить расписание';
    set(scheduleLoadErrorAtom, message);
    if (/401|Authentication required/i.test(message)) {
      set(tutorAtom, null);
    }
    throw err;
  } finally {
    if (seq === loadScheduleSeq) {
      set(scheduleLoadingAtom, false);
    }
  }
}
