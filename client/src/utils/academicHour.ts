import type { AcademicUnits } from '../api/types';

export const ACADEMIC_HOUR_PRESETS = [45, 50, 60] as const;

export function durationMinFromUnits(units: AcademicUnits, academicHourMin: number): number {
  return academicHourMin * units;
}

export function lessonPrice(rate: number, units: AcademicUnits): number {
  return rate * units;
}

export function academicUnitsLabel(units: AcademicUnits): string {
  return units === 2 ? 'Двойной' : 'Одинарный';
}

export function academicUnitsShort(units: AcademicUnits): string {
  return units === 2 ? '2 ак. ч' : '1 ак. ч';
}

export function academicHourHint(academicHourMin: number): string {
  return `1 ак. ч = ${academicHourMin} мин`;
}
