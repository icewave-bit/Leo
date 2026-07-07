import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  lessonsAtom,
  personalEventGroupsAtom,
  personalEventsAtom,
  recurringPersonalSchedulesAtom,
  recurringSchedulesAtom,
  scheduleLoadErrorAtom,
  scheduleLoadingAtom,
  studentLessonsBumpAtom,
  studentsAtom,
  weekStartAtom,
  scheduleSlotOverridesAtom,
} from '../atoms/schedule';
import {
  lessonToView,
  personalEventToView,
  studentToView,
  weekRangeUtc,
} from '../utils/schedule';

export type LoadScheduleOptions = {
  /** Week to load; defaults to current `weekStartAtom`. */
  anchor?: Date;
  /** Week navigation — only lessons and personal events; skip students and recurring. */
  lessonsOnly?: boolean;
};

let loadScheduleSeq = 0;

function applyWeekEvents(
  get: Getter,
  set: Setter,
  weekStart: Date,
  lessons: Awaited<ReturnType<typeof api.lessons>>,
  personalEvents: Awaited<ReturnType<typeof api.personalEvents>>,
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
  set(
    personalEventsAtom,
    personalEvents.map((e) => personalEventToView(e, weekStart, timezone)),
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

    const [lessons, personalEvents] = await Promise.all([
      api.lessons(from, to),
      api.personalEvents(from, to),
    ]);
    if (seq !== loadScheduleSeq) return;

    if (opts?.lessonsOnly) {
      applyWeekEvents(get, set, weekStart, lessons, personalEvents, tutor.timezone);
      return;
    }

    const [students, recurringSchedules, recurringPersonalSchedules, groups, slotOverrides] =
      await Promise.all([
        api.students(),
        api.recurringSchedules(),
        api.recurringPersonalSchedules(),
        api.personalEventGroups(),
        api.scheduleSlotOverrides(),
      ]);
    if (seq !== loadScheduleSeq) return;

    set(studentsAtom, students.map(studentToView));
    set(recurringSchedulesAtom, recurringSchedules);
    set(recurringPersonalSchedulesAtom, recurringPersonalSchedules);
    set(personalEventGroupsAtom, groups);
    set(scheduleSlotOverridesAtom, slotOverrides);
    applyWeekEvents(get, set, weekStart, lessons, personalEvents, tutor.timezone);
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
