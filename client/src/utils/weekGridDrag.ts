import {
  WG_AUTOSCROLL_EDGE_PX,
  WG_AUTOSCROLL_MAX_SPEED,
  WG_HOUR_LABEL_INSET,
} from '../constants/weekGrid';
import { clampLessonStart } from './schedule';

export function pointerToGridSlot(
  scrollEl: HTMLElement,
  bodyEl: HTMLElement,
  clientX: number,
  clientY: number,
  durationHours: number,
  pxPerHour: number,
  gutter: number,
  visibleDays: readonly number[],
  grabOffsetPx = 0,
): { day: number; start: number } {
  const bodyRect = bodyEl.getBoundingClientRect();
  const scrollRect = scrollEl.getBoundingClientRect();

  const yInBody =
    scrollEl.scrollTop +
    (clientY - scrollRect.top) -
    WG_HOUR_LABEL_INSET -
    grabOffsetPx;
  const start = clampLessonStart(yInBody / pxPerHour, durationHours);

  const colCount = Math.max(1, visibleDays.length);
  const gridWidth = bodyRect.width - gutter;
  const colW = gridWidth / colCount;
  const xInGrid = clientX - bodyRect.left - gutter;
  const colIndex = Math.max(0, Math.min(colCount - 1, Math.floor(xInGrid / colW)));
  const day = visibleDays[colIndex] ?? visibleDays[0] ?? 0;

  return { day, start };
}

export function autoScrollGrid(
  scrollEl: HTMLElement,
  clientY: number,
): void {
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
