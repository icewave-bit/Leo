import { atom } from 'jotai';
import type { ActivityActor, ActivityEntityType, ActivityLogEntry, ActivityStatus } from '../api/types';
import type { PaymentsPeriod } from './payments';

export const activityLogPeriodAtom = atom<PaymentsPeriod>('week');
export const activityLogCustomFromAtom = atom('');
export const activityLogCustomToAtom = atom('');
export const activityLogStatusAtom = atom<ActivityStatus | 'all'>('all');
export const activityLogActorAtom = atom<ActivityActor | 'all'>('all');
export const activityLogEntityAtom = atom<ActivityEntityType | 'all'>('all');
export const activityLogStudentIdAtom = atom<string | null>(null);
export const activityLogQueryAtom = atom('');
export const activityLogItemsAtom = atom<ActivityLogEntry[]>([]);
export const activityLogTotalAtom = atom(0);
export const activityLogLoadingAtom = atom(false);
export const activityLogErrorAtom = atom<string | null>(null);
export const activityLogCollapsedDaysAtom = atom<ReadonlySet<string>>(new Set<string>());
