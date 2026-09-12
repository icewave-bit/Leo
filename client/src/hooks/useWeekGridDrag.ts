import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  WG_DRAG_THRESHOLD_PX,
  WG_GUTTER,
  WG_HOUR_LABEL_INSET,
  WG_PX_PER_HOUR,
} from '../constants/weekGrid';
import {
  formatLessonSlot,
  sameLessonSlot,
  type ViewLesson,
  type ViewStudent,
} from '../utils/schedule';
import { isLessonPast } from '../utils/lessonBalance';
import { autoScrollGrid, pointerToGridSlot } from '../utils/weekGridDrag';

export interface PendingReschedule {
  lesson: ViewLesson;
  studentName: string;
  from: { day: number; start: number };
  to: { day: number; start: number };
}

interface DragSession {
  lesson: ViewLesson;
  pointerId: number;
  origin: { day: number; start: number };
  startClientX: number;
  startClientY: number;
  grabOffsetPx: number;
  moved: boolean;
}

export function useWeekGridDrag(opts: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  dates: number[];
  studentName: (studentId: string) => string | undefined;
  onSelect: (id: string) => void;
  onReschedule: (
    id: string,
    day: number,
    start: number,
    opts?: { restoreBalance?: boolean; moveSeries?: boolean },
  ) => Promise<void>;
  getStudent: (id: string) => ViewStudent | undefined;
  daysFull: readonly string[];
  pxPerHour?: number;
  gutter?: number;
  visibleDays?: readonly number[];
}) {
  const {
    scrollRef,
    bodyRef,
    dates,
    studentName,
    onSelect,
    onReschedule,
    getStudent,
    daysFull,
    pxPerHour = WG_PX_PER_HOUR,
    gutter = WG_GUTTER,
    visibleDays = [0, 1, 2, 3, 4, 5, 6],
  } = opts;

  const sessionRef = useRef<DragSession | null>(null);
  const lastClientYRef = useRef(0);
  const suppressClickRef = useRef(false);

  const [active, setActive] = useState(false);
  const [dragLesson, setDragLesson] = useState<ViewLesson | null>(null);
  const [preview, setPreview] = useState<{ day: number; start: number } | null>(null);
  const [pending, setPending] = useState<PendingReschedule | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [restoreBalance, setRestoreBalance] = useState(true);
  const [moveSeries, setMoveSeries] = useState(false);

  const endDrag = useCallback(() => {
    sessionRef.current = null;
    setActive(false);
    setDragLesson(null);
    setPreview(null);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, lesson: ViewLesson) => {
      if (e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const scrollEl = scrollRef.current;
      let grabOffsetPx = 0;
      if (scrollEl) {
        const scrollRect = scrollEl.getBoundingClientRect();
        grabOffsetPx =
          scrollEl.scrollTop +
          (e.clientY - scrollRect.top) -
          WG_HOUR_LABEL_INSET -
          lesson.start * pxPerHour;
      }

      sessionRef.current = {
        lesson,
        pointerId: e.pointerId,
        origin: { day: lesson.day, start: lesson.start },
        startClientX: e.clientX,
        startClientY: e.clientY,
        grabOffsetPx,
        moved: false,
      };
      lastClientYRef.current = e.clientY;
    },
    [pxPerHour, scrollRef],
  );

  useEffect(() => {
    if (!active) return;

    let raf = 0;
    const tick = () => {
      const scrollEl = scrollRef.current;
      if (scrollEl) autoScrollGrid(scrollEl, lastClientYRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, scrollRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const scrollEl = scrollRef.current;
      const bodyEl = bodyRef.current;
      if (!scrollEl || !bodyEl) return;

      lastClientYRef.current = e.clientY;

      const dx = e.clientX - session.startClientX;
      const dy = e.clientY - session.startClientY;
      if (!session.moved) {
        if (Math.hypot(dx, dy) < WG_DRAG_THRESHOLD_PX) return;
        session.moved = true;
        setActive(true);
        setDragLesson(session.lesson);
      }

      e.preventDefault();
      const slot = pointerToGridSlot(
        scrollEl,
        bodyEl,
        e.clientX,
        e.clientY,
        session.lesson.dur,
        pxPerHour,
        gutter,
        visibleDays,
        session.grabOffsetPx,
      );
      setPreview(slot);
    };

    const onUp = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const scrollEl = scrollRef.current;
      const bodyEl = bodyRef.current;

      if (session.moved && scrollEl && bodyEl) {
        const slot = pointerToGridSlot(
          scrollEl,
          bodyEl,
          e.clientX,
          e.clientY,
          session.lesson.dur,
          pxPerHour,
          gutter,
          visibleDays,
          session.grabOffsetPx,
        );
        suppressClickRef.current = true;
        if (!sameLessonSlot(session.origin, slot)) {
          const lesson = session.lesson;
          setRestoreBalance(lesson.balanceCharged);
          setMoveSeries(false);
          setPending({
            lesson,
            studentName: studentName(lesson.studentId) ?? 'Ученик',
            from: session.origin,
            to: slot,
          });
        }
      } else if (!session.moved) {
        onSelect(session.lesson.id);
      }

      endDrag();
    };

    const onCancel = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      if (session.moved) suppressClickRef.current = true;
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [bodyRef, endDrag, gutter, onSelect, pxPerHour, scrollRef, studentName, visibleDays]);

  const onLessonClick = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelect(id);
    },
    [onSelect],
  );

  const needsBalanceConfirm = pending
    ? isLessonPast(pending.lesson.startUtc, pending.lesson.durationMin)
    : false;
  const pendingStudent = pending ? getStudent(pending.lesson.studentId) : undefined;
  const pendingSeries = Boolean(pending?.lesson.recurringScheduleId);

  const confirmReschedule = useCallback(async () => {
    if (!pending) return;
    setRescheduling(true);
    try {
      const opts =
        needsBalanceConfirm || moveSeries
          ? {
              ...(needsBalanceConfirm ? { restoreBalance } : {}),
              ...(moveSeries ? { moveSeries: true } : {}),
            }
          : undefined;
      await onReschedule(pending.lesson.id, pending.to.day, pending.to.start, opts);
      setPending(null);
    } finally {
      setRescheduling(false);
    }
  }, [moveSeries, needsBalanceConfirm, onReschedule, pending, restoreBalance]);

  const cancelReschedule = useCallback(() => {
    if (!rescheduling) setPending(null);
  }, [rescheduling]);

  const rescheduleDescription = pending
    ? `${pending.studentName}: ${formatLessonSlot(pending.from.day, pending.from.start, pending.lesson.dur, dates, daysFull)} → ${formatLessonSlot(pending.to.day, pending.to.start, pending.lesson.dur, dates, daysFull)}`
    : '';

  return {
    active,
    dragLesson,
    preview,
    pending,
    pendingStudent,
    pendingSeries,
    needsBalanceConfirm,
    restoreBalance,
    setRestoreBalance,
    moveSeries,
    setMoveSeries,
    rescheduling,
    rescheduleDescription,
    onPointerDown,
    onLessonClick,
    confirmReschedule,
    cancelReschedule,
  };
}
