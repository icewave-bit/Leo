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
  type ViewPersonalEvent,
} from '../utils/schedule';
import { autoScrollGrid, pointerToGridSlot } from '../utils/weekGridDrag';

interface DragSession {
  event: ViewPersonalEvent;
  pointerId: number;
  origin: { day: number; start: number };
  startClientX: number;
  startClientY: number;
  grabOffsetPx: number;
  moved: boolean;
}

export function usePersonalEventGridDrag(opts: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  dates: number[];
  daysFull: readonly string[];
  onSelect: (id: string) => void;
  onReschedule: (id: string, day: number, start: number) => Promise<void>;
  pxPerHour?: number;
  gutter?: number;
  visibleDays?: readonly number[];
}) {
  const {
    scrollRef,
    bodyRef,
    dates,
    daysFull,
    onSelect,
    onReschedule,
    pxPerHour = WG_PX_PER_HOUR,
    gutter = WG_GUTTER,
    visibleDays = [0, 1, 2, 3, 4, 5, 6],
  } = opts;

  const sessionRef = useRef<DragSession | null>(null);
  const lastClientYRef = useRef(0);
  const suppressClickRef = useRef(false);

  const [active, setActive] = useState(false);
  const [dragEvent, setDragEvent] = useState<ViewPersonalEvent | null>(null);
  const [preview, setPreview] = useState<{ day: number; start: number } | null>(null);
  const [pending, setPending] = useState<{
    event: ViewPersonalEvent;
    from: { day: number; start: number };
    to: { day: number; start: number };
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const endDrag = useCallback(() => {
    sessionRef.current = null;
    setActive(false);
    setDragEvent(null);
    setPreview(null);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, event: ViewPersonalEvent) => {
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
        event.start * pxPerHour;
    }

    sessionRef.current = {
      event,
      pointerId: e.pointerId,
      origin: { day: event.day, start: event.start },
      startClientX: e.clientX,
      startClientY: e.clientY,
      grabOffsetPx,
      moved: false,
    };
    lastClientYRef.current = e.clientY;
  }, [pxPerHour, scrollRef]);

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
        setDragEvent(session.event);
      }

      e.preventDefault();
      setPreview(
        pointerToGridSlot(
          scrollEl,
          bodyEl,
          e.clientX,
          e.clientY,
          session.event.dur,
          pxPerHour,
          gutter,
          visibleDays,
          session.grabOffsetPx,
        ),
      );
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
          session.event.dur,
          pxPerHour,
          gutter,
          visibleDays,
          session.grabOffsetPx,
        );
        suppressClickRef.current = true;
        if (!sameLessonSlot(session.origin, slot)) {
          setPending({ event: session.event, from: session.origin, to: slot });
        }
      } else if (!session.moved) {
        onSelect(session.event.id);
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
  }, [bodyRef, endDrag, gutter, onSelect, pxPerHour, scrollRef, visibleDays]);

  const onEventClick = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelect(id);
    },
    [onSelect],
  );

  const confirmReschedule = useCallback(async () => {
    if (!pending) return;
    setRescheduling(true);
    try {
      await onReschedule(pending.event.id, pending.to.day, pending.to.start);
      setPending(null);
    } finally {
      setRescheduling(false);
    }
  }, [onReschedule, pending]);

  const cancelReschedule = useCallback(() => {
    if (!rescheduling) setPending(null);
  }, [rescheduling]);

  const rescheduleDescription = pending
    ? `${pending.event.title}: ${formatLessonSlot(pending.from.day, pending.from.start, pending.event.dur, dates, daysFull)} → ${formatLessonSlot(pending.to.day, pending.to.start, pending.event.dur, dates, daysFull)}`
    : '';

  return {
    active,
    dragEvent,
    preview,
    pending,
    rescheduling,
    rescheduleDescription,
    onPointerDown,
    onEventClick,
    confirmReschedule,
    cancelReschedule,
  };
}
