export type UUID = string;

export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;

export interface Tutor {
  id: UUID;
  email: string;
  name: string;
  initials: string;
  subject: string | null;
  timezone: string;
  academicHourMin: number;
  weekStartsOn: WeekStartsOn;
  createdAt: string;
}

export interface Student {
  id: UUID;
  tutorId: UUID;
  name: string;
  initials: string;
  hue: number;
  tz: string;
  meetUrl: string | null;
  rate: number | null;
  currency: string;
  note: string | null;
  isGroup: boolean;
  members: string[];
  balanceKind: BalanceKind;
  prepaid: number;
  debt: number;
  createdAt: string;
}

export interface Lesson {
  id: UUID;
  tutorId: UUID;
  studentId: UUID;
  startUtc: string;
  durationMin: number;
  academicUnits: AcademicUnits;
  status: LessonStatus;
  type: LessonType;
  paid: boolean;
  notes: string | null;
  balanceCharged: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INTERNAL';
