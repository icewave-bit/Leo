import type { CSSProperties } from 'react';
import type { ViewLesson } from './schedule';

const TIME_EPS = 0.001;

export interface WeekGridLessonLayout {
  column: number;
  columnCount: number;
}

export function lessonTimeRangesOverlap(
  a: Pick<ViewLesson, 'start' | 'dur'>,
  b: Pick<ViewLesson, 'start' | 'dur'>,
): boolean {
  return a.start < b.start + b.dur - TIME_EPS && b.start < a.start + a.dur - TIME_EPS;
}

function overlapCluster(lesson: ViewLesson, lessons: ViewLesson[]): ViewLesson[] {
  const cluster: ViewLesson[] = [];
  const seen = new Set<string>();
  const stack = [lesson];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    cluster.push(cur);
    for (const other of lessons) {
      if (!seen.has(other.id) && lessonTimeRangesOverlap(cur, other)) {
        stack.push(other);
      }
    }
  }
  return cluster;
}

/** Side-by-side columns for overlapping lessons in one day column. */
export function layoutDayLessons(lessons: ViewLesson[]): Map<string, WeekGridLessonLayout> {
  const result = new Map<string, WeekGridLessonLayout>();
  if (lessons.length === 0) return result;

  const sorted = [...lessons].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const colEnds: number[] = [];
  const columnById = new Map<string, number>();

  for (const lesson of sorted) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > lesson.start + TIME_EPS) col++;
    if (col === colEnds.length) colEnds.push(0);
    colEnds[col] = lesson.start + lesson.dur;
    columnById.set(lesson.id, col);
  }

  for (const lesson of lessons) {
    const cluster = overlapCluster(lesson, lessons);
    const columnCount =
      Math.max(...cluster.map((l) => columnById.get(l.id) ?? 0)) + 1;
    result.set(lesson.id, {
      column: columnById.get(lesson.id) ?? 0,
      columnCount,
    });
  }

  return result;
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
