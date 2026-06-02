import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  WG_AUTOSCROLL_EDGE_PX,
  WG_AUTOSCROLL_MAX_SPEED,
  WG_DRAG_THRESHOLD_PX,
  WG_HOUR_LABEL_INSET,
  WG_PX_PER_HOUR,
} from '../constants/weekGrid';
import {
  clampLessonStart,
  formatLessonSlot,
  sameLessonSlot,
  type ViewLesson,
  type ViewStudent,
} from '../utils/schedule';
import { isLessonPast } from '../utils/lessonBalance';

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
  moved: boolean;
}

function pointerToSlot(
  scrollEl: HTMLElement,
  bodyEl: HTMLElement,
  clientX: number,
  clientY: number,
  durationHours: number,
): { day: number; start: number } {
  const bodyRect = bodyEl.getBoundingClientRect();
  const scrollRect = scrollEl.getBoundingClientRect();
  const gutter = 56;

  const yInBody =
    scrollEl.scrollTop + (clientY - scrollRect.top) - WG_HOUR_LABEL_INSET;
  const start = clampLessonStart(yInBody / WG_PX_PER_HOUR, durationHours);

  const gridWidth = bodyRect.width - gutter;
  const colW = gridWidth / 7;
  const xInGrid = clientX - bodyRect.left - gutter;
  const day = Math.max(0, Math.min(6, Math.floor(xInGrid / colW)));

  return { day, start };
}

function autoScrollStep(scrollEl: HTMLElement, clientY: number): void {
  const rect = scrollEl.getBoundingClientRect();
  if (clientY < rect.top + WG_AUTOSCROLL_EDGE_PX) {
    const t = 1 - Math.max(0, clientY - rect.top) / WG_AUTOSCROLL_EDGE_PX;
    scrollEl.scrollTop -= WG_AUTOSCROLL_MAX_SPEED * t;
  } else if (clientY > rect.bottom - WG_AUTOSCROLL_EDGE_PX) {
    const t = 1 - Math.max(0, rect.bottom - clientY) / WG_AUTOSCROLL_EDGE_PX;
    scrollEl.scrollTop += WG_AUTOSCROLL_MAX_SPEED * t;
  }

  if (clientY < WG_AUTOSCROLL_EDGE_PX) {
    const t = 1 - clientY / WG_AUTOSCROLL_EDGE_PX;
    window.scrollBy(0, -WG_AUTOSCROLL_MAX_SPEED * t);
  } else if (clientY > window.innerHeight - WG_AUTOSCROLL_EDGE_PX) {
    const t = 1 - (window.innerHeight - clientY) / WG_AUTOSCROLL_EDGE_PX;
    window.scrollBy(0, WG_AUTOSCROLL_MAX_SPEED * t);
  }
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
    opts?: { restoreBalance?: boolean },
  ) => Promise<void>;
  getStudent: (id: string) => ViewStudent | undefined;
  daysFull: readonly string[];
}) {
  const { scrollRef, bodyRef, dates, studentName, onSelect, onReschedule, getStudent, daysFull } =
    opts;

  const sessionRef = useRef<DragSession | null>(null);
  const lastClientYRef = useRef(0);
  const suppressClickRef = useRef(false);

  const [active, setActive] = useState(false);
  const [dragLesson, setDragLesson] = useState<ViewLesson | null>(null);
  const [preview, setPreview] = useState<{ day: number; start: number } | null>(null);
  const [pending, setPending] = useState<PendingReschedule | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [restoreBalance, setRestoreBalance] = useState(true);

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

      sessionRef.current = {
        lesson,
        pointerId: e.pointerId,
        origin: { day: lesson.day, start: lesson.start },
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      };
      lastClientYRef.current = e.clientY;
    },
    [],
  );

  useEffect(() => {
    if (!active) return;

    let raf = 0;
    const tick = () => {
      const scrollEl = scrollRef.current;
      if (scrollEl) autoScrollStep(scrollEl, lastClientYRef.current);
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
      const slot = pointerToSlot(
        scrollEl,
        bodyEl,
        e.clientX,
        e.clientY,
        session.lesson.dur,
      );
      setPreview(slot);
    };

    const onUp = (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const scrollEl = scrollRef.current;
      const bodyEl = bodyRef.current;

      if (session.moved && scrollEl && bodyEl) {
        const slot = pointerToSlot(
          scrollEl,
          bodyEl,
          e.clientX,
          e.clientY,
          session.lesson.dur,
        );
        suppressClickRef.current = true;
        if (!sameLessonSlot(session.origin, slot)) {
          const lesson = session.lesson;
          setRestoreBalance(lesson.balanceCharged);
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
  }, [bodyRef, endDrag, onSelect, scrollRef, studentName]);

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

  const confirmReschedule = useCallback(async () => {
    if (!pending) return;
    setRescheduling(true);
    try {
      await onReschedule(
        pending.lesson.id,
        pending.to.day,
        pending.to.start,
        needsBalanceConfirm ? { restoreBalance } : undefined,
      );
      setPending(null);
    } finally {
      setRescheduling(false);
    }
  }, [needsBalanceConfirm, onReschedule, pending, restoreBalance]);

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
    needsBalanceConfirm,
    restoreBalance,
    setRestoreBalance,
    rescheduling,
    rescheduleDescription,
    onPointerDown,
    onLessonClick,
    confirmReschedule,
    cancelReschedule,
  };
}
