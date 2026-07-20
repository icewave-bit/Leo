import type {
  ApiError,
  BalanceMovement,
  BillingDebtBreakdown,
  CreateStudentBody,
  TaxReplenishment,
  Lesson,
  LessonType,
  RecurringSchedule,
  Student,
  PatchTutorBody,
  Tutor,
  UpdateStudentBody,
} from './types';
import { getViteMergedEnv } from '../lib/runtimeEnv';

function apiBase(): string {
  const s = getViteMergedEnv('VITE_API_URL');
  if (s === '') return '';
  return s.replace(/\/$/, '');
}

const base = apiBase();

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body: string | undefined;
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T | ApiError) : undefined;

  if (!res.ok) {
    const err = data as ApiError | undefined;
    throw new Error(err?.error?.message ?? `Request failed (${res.status})`);
  }

  return data as T;
}

export const api = {
  me: () => request<{ tutor: Tutor }>('/api/auth/me'),
  patchMe: (body: PatchTutorBody) =>
    request<{ tutor: Tutor }>('/api/auth/me', { method: 'PATCH', json: body }),
  createTelegramLinkCode: () =>
    request<{ code: string; expiresAt: string }>('/api/auth/telegram/link-code', {
      method: 'POST',
    }),
  unlinkTelegram: () =>
    request<{ tutor: Tutor }>('/api/auth/telegram/unlink', { method: 'POST' }),
  login: (email: string, password: string) =>
    request<{ tutor: Tutor }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
    }),
  register: (body: { email: string; password: string; name: string; timezone?: string }) =>
    request<{ tutor: Tutor }>('/api/auth/register', { method: 'POST', json: body }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  balanceMovements: (from: string, to: string, studentId?: string) => {
    const params = new URLSearchParams({ from, to });
    if (studentId) params.set('studentId', studentId);
    return request<BalanceMovement[]>(`/api/balance-movements?${params}`);
  },

  taxReplenishments: (month: string, studentId?: string) => {
    const params = new URLSearchParams({ month });
    if (studentId) params.set('studentId', studentId);
    return request<TaxReplenishment[]>(`/api/taxes?${params}`);
  },
  patchTaxReplenishment: (
    movementId: string,
    body: { taxPaid?: boolean; comment?: string; receivedOn?: string },
  ) =>
    request<void>(`/api/taxes/${movementId}`, { method: 'PATCH', json: body }),
  deleteTaxReplenishment: (movementId: string) =>
    request<void>(`/api/taxes/${movementId}`, { method: 'DELETE' }),
  createTaxReplenishment: (body: {
    studentId: string;
    receivedOn: string;
    currency: string;
    amount: number;
  }) =>
    request<import('./types').TaxReplenishment>('/api/taxes', {
      method: 'POST',
      json: body,
    }),

  students: () => request<Student[]>('/api/students'),
  archivedStudents: () => request<Student[]>('/api/students/archived/list'),
  getStudent: (id: string) => request<Student>(`/api/students/${id}`),
  studentBillingDebt: (id: string) =>
    request<BillingDebtBreakdown>(`/api/students/${id}/billing-debt`),
  createStudent: (body: CreateStudentBody) =>
    request<Student>('/api/students', { method: 'POST', json: body }),
  updateStudent: (id: string, body: UpdateStudentBody) =>
    request<Student>(`/api/students/${id}`, { method: 'PATCH', json: body }),
  archiveStudent: (id: string) =>
    request<Student>(`/api/students/${id}/archive`, { method: 'POST' }),
  restoreStudent: (id: string) =>
    request<Student>(`/api/students/${id}/restore`, { method: 'POST' }),
  deleteStudent: (id: string) =>
    request<void>(`/api/students/${id}`, { method: 'DELETE' }),
  lessons: (from: string, to: string, studentId?: string) => {
    const params = new URLSearchParams({ from, to });
    if (studentId) params.set('studentId', studentId);
    return request<Lesson[]>(`/api/lessons?${params}`);
  },
  createLesson: (body: {
    studentId: string;
    startUtc: string;
    academicUnits: 1 | 2;
    type?: LessonType;
    notes?: string | null;
  }) => request<Lesson>('/api/lessons', { method: 'POST', json: body }),
  patchLesson: (
    id: string,
    body: Partial<Pick<Lesson, 'status' | 'paid' | 'notes' | 'startUtc'>> & {
      restoreBalance?: boolean;
    },
  ) => request<Lesson>(`/api/lessons/${id}`, { method: 'PATCH', json: body }),
  deleteLesson: (id: string, opts?: { restoreBalance?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.restoreBalance) params.set('restoreBalance', 'true');
    const qs = params.toString();
    return request<void>(`/api/lessons/${id}${qs ? `?${qs}` : ''}`, { method: 'DELETE' });
  },

  recurringSchedules: () => request<RecurringSchedule[]>('/api/recurring-schedules'),
  createRecurringSchedule: (body: {
    studentId: string;
    weekdays: number[];
    startMinutes: number;
    academicUnits: 1 | 2;
    type?: LessonType;
    notes?: string | null;
    intervalWeeks?: number;
    startDate: string;
    endDate?: string | null;
  }) => request<RecurringSchedule>('/api/recurring-schedules', { method: 'POST', json: body }),
  patchRecurringSchedule: (
    id: string,
    body: Partial<Pick<RecurringSchedule, 'active' | 'endDate' | 'notes'>>,
  ) => request<RecurringSchedule>(`/api/recurring-schedules/${id}`, { method: 'PATCH', json: body }),
  deleteRecurringSchedule: (id: string, fromLessonId: string) => {
    const params = new URLSearchParams({ fromLessonId });
    return request<void>(`/api/recurring-schedules/${id}?${params}`, { method: 'DELETE' });
  },

  personalEventGroups: () =>
    request<import('./types').PersonalEventGroup[]>('/api/personal-event-groups'),
  createPersonalEventGroup: (body: { name: string; color: string; sortOrder?: number }) =>
    request<import('./types').PersonalEventGroup>('/api/personal-event-groups', {
      method: 'POST',
      json: body,
    }),
  patchPersonalEventGroup: (
    id: string,
    body: Partial<{ name: string; color: string; sortOrder: number }>,
  ) =>
    request<import('./types').PersonalEventGroup>(`/api/personal-event-groups/${id}`, {
      method: 'PATCH',
      json: body,
    }),
  deletePersonalEventGroup: (id: string, reassignTo?: string) => {
    const params = new URLSearchParams();
    if (reassignTo) params.set('reassignTo', reassignTo);
    const qs = params.toString();
    return request<void>(
      `/api/personal-event-groups/${id}${qs ? `?${qs}` : ''}`,
      { method: 'DELETE' },
    );
  },

  personalEvents: (from: string, to: string) => {
    const params = new URLSearchParams({ from, to });
    return request<import('./types').PersonalEvent[]>(`/api/personal-events?${params}`);
  },
  createPersonalEvent: (body: {
    groupId: string;
    title: string;
    startUtc: string;
    durationMin: number;
    notes?: string | null;
  }) =>
    request<import('./types').PersonalEvent>('/api/personal-events', { method: 'POST', json: body }),
  patchPersonalEvent: (
    id: string,
    body: Partial<{
      groupId: string;
      title: string;
      startUtc: string;
      durationMin: number;
      notes: string | null;
    }>,
  ) =>
    request<import('./types').PersonalEvent>(`/api/personal-events/${id}`, {
      method: 'PATCH',
      json: body,
    }),
  deletePersonalEvent: (id: string) =>
    request<void>(`/api/personal-events/${id}`, { method: 'DELETE' }),

  recurringPersonalSchedules: () =>
    request<import('./types').RecurringPersonalSchedule[]>('/api/recurring-personal-schedules'),
  createRecurringPersonalSchedule: (body: {
    groupId: string;
    title: string;
    weekdays: number[];
    startMinutes: number;
    durationMin: number;
    notes?: string | null;
    intervalWeeks?: number;
    startDate: string;
    endDate?: string | null;
  }) =>
    request<import('./types').RecurringPersonalSchedule>('/api/recurring-personal-schedules', {
      method: 'POST',
      json: body,
    }),
  deleteRecurringPersonalSchedule: (id: string, fromEventId: string) => {
    const params = new URLSearchParams({ fromEventId });
    return request<void>(`/api/recurring-personal-schedules/${id}?${params}`, {
      method: 'DELETE',
    });
  },

  scheduleSlotOverrides: () =>
    request<import('./types').ScheduleSlotOverride[]>('/api/schedule-slot-overrides'),
  toggleScheduleSlot: (body: {
    weekday: number;
    startMinutes: number;
    hasEvent: boolean;
  }) =>
    request<{ overrides: import('./types').ScheduleSlotOverride[]; blocked: boolean }>(
      '/api/schedule-slot-overrides/toggle',
      { method: 'PUT', json: body },
    ),
};
