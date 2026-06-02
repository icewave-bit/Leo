import { query } from './db.js';
import type { AcademicUnits } from './types.js';

export function durationMinFromUnits(units: AcademicUnits, academicHourMin: number): number {
  return academicHourMin * units;
}

export function inferAcademicUnits(durationMin: number, academicHourMin: number): AcademicUnits {
  return durationMin >= academicHourMin * 1.5 ? 2 : 1;
}

export async function getTutorAcademicHourMin(tutorId: string): Promise<number> {
  const result = await query<{ academic_hour_min: number }>(
    'SELECT academic_hour_min FROM tutors WHERE id = $1',
    [tutorId],
  );
  return result.rows[0]?.academic_hour_min ?? 60;
}
