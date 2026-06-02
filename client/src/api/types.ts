export type LessonStatus = 'planned' | 'completed' | 'cancelled' | 'no_show';
export type LessonType = 'solo' | 'group';
export type BalanceKind = 'money' | 'lessons';
export type WeekStartsOn = 'monday' | 'sunday';
export type AcademicUnits = 1 | 2;

export interface Tutor {
  id: string;
  email: string;
  name: string;
  initials: string;
  subject: string | null;
  timezone: string;
  academicHourMin: number;
  weekStartsOn: WeekStartsOn;
  createdAt: string;
}

export type PatchTutorBody = {
  academicHourMin?: number;
  weekStartsOn?: WeekStartsOn;
};

export interface Student {
  id: string;
  tutorId: string;
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

export type CreateStudentBody = {
  name: string;
  initials?: string;
  hue?: number;
  tz?: string;
  meetUrl?: string | null;
  rate?: number | null;
  currency?: string;
  note?: string | null;
  isGroup?: boolean;
  members?: string[];
  balanceKind?: BalanceKind;
  prepaid?: number;
  debt?: number;
};

export type UpdateStudentBody = Partial<CreateStudentBody>;

export interface Lesson {
  id: string;
  tutorId: string;
  studentId: string;
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

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
