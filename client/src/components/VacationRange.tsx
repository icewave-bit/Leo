import { useAtomValue } from 'jotai';
import type { WeekStartsOn } from '../api/types';
import { tutorAtom } from '../atoms/auth';
import { fmtDateKey } from '../utils/dateKey';

export function vacationRangeText(
  startDate: string,
  endDate: string,
  weekStartsOn: WeekStartsOn = 'monday',
): string {
  return `В отпуске с ${fmtDateKey(startDate, weekStartsOn)} по ${fmtDateKey(endDate, weekStartsOn)}`;
}

export function VacationRange({
  startDate,
  endDate,
  className,
}: {
  startDate: string;
  endDate: string;
  className?: string;
}) {
  const tutor = useAtomValue(tutorAtom);
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';

  return (
    <p className={'vacation-range' + (className ? ` ${className}` : '')}>
      {vacationRangeText(startDate, endDate, weekStartsOn)}
    </p>
  );
}
