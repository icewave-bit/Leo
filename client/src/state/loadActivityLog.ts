import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  activityLogActorAtom,
  activityLogCustomFromAtom,
  activityLogCustomToAtom,
  activityLogEntityAtom,
  activityLogErrorAtom,
  activityLogItemsAtom,
  activityLogLoadingAtom,
  activityLogPeriodAtom,
  activityLogQueryAtom,
  activityLogStatusAtom,
  activityLogStudentIdAtom,
  activityLogTotalAtom,
} from '../atoms/activityLog';
import { periodRange } from '../utils/paymentJournal';

const PAGE_SIZE = 80;

export async function loadActivityLog(
  get: Getter,
  set: Setter,
  opts?: { append?: boolean },
): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  const period = get(activityLogPeriodAtom);
  const customFrom = get(activityLogCustomFromAtom);
  const customTo = get(activityLogCustomToAtom);
  const { from, to } = periodRange(
    period,
    tutor.timezone,
    { from: customFrom, to: customTo },
    new Date(),
    tutor.weekStartsOn,
  );

  const status = get(activityLogStatusAtom);
  const actor = get(activityLogActorAtom);
  const entityType = get(activityLogEntityAtom);
  const studentId = get(activityLogStudentIdAtom);
  const q = get(activityLogQueryAtom).trim();
  const offset = opts?.append ? get(activityLogItemsAtom).length : 0;

  set(activityLogLoadingAtom, true);
  set(activityLogErrorAtom, null);
  try {
    const page = await api.activityLog({
      from,
      to,
      status: status === 'all' ? undefined : status,
      actor: actor === 'all' ? undefined : actor,
      entityType: entityType === 'all' ? undefined : entityType,
      studentId: studentId ?? undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    set(activityLogItemsAtom, opts?.append ? [...get(activityLogItemsAtom), ...page.items] : page.items);
    set(activityLogTotalAtom, page.total);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить журнал';
    set(activityLogErrorAtom, message);
    if (!opts?.append) set(activityLogItemsAtom, []);
  } finally {
    set(activityLogLoadingAtom, false);
  }
}
