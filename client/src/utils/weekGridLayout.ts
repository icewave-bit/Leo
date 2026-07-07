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

export function weekGridLessonPositionStyle(
  layout: WeekGridLessonLayout | undefined,
): CSSProperties {
  if (!layout || layout.columnCount <= 1) return {};

  const { column, columnCount } = layout;
  const gaps = WG_COL_GAP_PX * (columnCount - 1);
  const widthExpr = `(100% - ${WG_COL_INSET_PX * 2}px - ${gaps}px) / ${columnCount}`;
  const leftExpr = `${WG_COL_INSET_PX}px + (${widthExpr}) * ${column} + ${WG_COL_GAP_PX * column}px`;

  return {
    left: `calc(${leftExpr})`,
    width: `calc(${widthExpr})`,
    right: 'auto',
  };
}

export function weekGridLessonLayoutClass(
  layout: WeekGridLessonLayout | undefined,
): string {
  if (!layout || layout.columnCount <= 1) return '';
  const last = layout.column === layout.columnCount - 1;
  return ['ev--cols', last ? '' : 'ev--cols-div'].filter(Boolean).join(' ');
}
