import type { CSSProperties } from 'react';

const TIME_EPS = 0.001;

export interface TimedGridItem {
  id: string;
  start: number;
  dur: number;
}

export interface WeekGridLessonLayout {
  column: number;
  columnCount: number;
}

export function timedRangesOverlap(
  a: Pick<TimedGridItem, 'start' | 'dur'>,
  b: Pick<TimedGridItem, 'start' | 'dur'>,
): boolean {
  return a.start < b.start + b.dur - TIME_EPS && b.start < a.start + a.dur - TIME_EPS;
}

function overlapCluster<T extends TimedGridItem>(item: T, items: T[]): T[] {
  const cluster: T[] = [];
  const seen = new Set<string>();
  const stack = [item];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    cluster.push(cur);
    for (const other of items) {
      if (!seen.has(other.id) && timedRangesOverlap(cur, other)) {
        stack.push(other);
      }
    }
  }
  return cluster;
}

export function layoutDayTimedItems<T extends TimedGridItem>(
  items: T[],
): Map<string, WeekGridLessonLayout> {
  const result = new Map<string, WeekGridLessonLayout>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const colEnds: number[] = [];
  const columnById = new Map<string, number>();

  for (const item of sorted) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > item.start + TIME_EPS) col++;
    if (col === colEnds.length) colEnds.push(0);
    colEnds[col] = item.start + item.dur;
    columnById.set(item.id, col);
  }

  for (const item of items) {
    const cluster = overlapCluster(item, items);
    const columnCount = Math.max(...cluster.map((l) => columnById.get(l.id) ?? 0)) + 1;
    result.set(item.id, {
      column: columnById.get(item.id) ?? 0,
      columnCount,
    });
  }

  return result;
}

/** @deprecated Use layoutDayTimedItems */
export function layoutDayLessons(
  lessons: TimedGridItem[],
): Map<string, WeekGridLessonLayout> {
  return layoutDayTimedItems(lessons);
}

const WG_COL_INSET_PX = 3;
const WG_COL_GAP_PX = 2;
/** Gap under a timed block so the next hour’s event does not touch it. */
export const WG_EVENT_TAIL_GAP_PX = 4;

/** Desktop splits overlaps side-by-side; compact (phone) stacks them in the time cell. */
export type WeekGridOverlapAxis = 'columns' | 'rows';

export function weekGridOverlapAxis(compact?: boolean): WeekGridOverlapAxis {
  return compact ? 'rows' : 'columns';
}

export function weekGridLessonPositionStyle(
  layout: WeekGridLessonLayout | undefined,
  opts: {
    start: number;
    dur: number;
    pxPerHour: number;
    axis?: WeekGridOverlapAxis;
  },
): CSSProperties {
  const { start, dur, pxPerHour, axis = 'columns' } = opts;
  const top = start * pxPerHour;
  const height = dur * pxPerHour - WG_EVENT_TAIL_GAP_PX;

  if (!layout || layout.columnCount <= 1) return { top, height };

  const { column, columnCount } = layout;

  if (axis === 'rows') {
    const rowH = height / columnCount;
    return {
      top: top + rowH * column,
      height: rowH,
    };
  }

  const gaps = WG_COL_GAP_PX * (columnCount - 1);
  const widthExpr = `(100% - ${WG_COL_INSET_PX * 2}px - ${gaps}px) / ${columnCount}`;
  const leftExpr = `${WG_COL_INSET_PX}px + (${widthExpr}) * ${column} + ${WG_COL_GAP_PX * column}px`;

  return {
    top,
    height,
    left: `calc(${leftExpr})`,
    width: `calc(${widthExpr})`,
    right: 'auto',
  };
}

export function weekGridLessonLayoutClass(
  layout: WeekGridLessonLayout | undefined,
  axis: WeekGridOverlapAxis = 'columns',
): string {
  if (!layout || layout.columnCount <= 1) return '';
  const first = layout.column === 0;
  const last = layout.column === layout.columnCount - 1;
  if (axis === 'rows') {
    return ['ev--stack', first ? 'ev--stack-first' : '', last ? 'ev--stack-last' : '', last ? '' : 'ev--stack-div']
      .filter(Boolean)
      .join(' ');
  }
  return ['ev--cols', last ? '' : 'ev--cols-div'].filter(Boolean).join(' ');
}
