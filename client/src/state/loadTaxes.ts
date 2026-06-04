import type { Getter, Setter } from 'jotai';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import {
  taxReplenishmentsAtom,
  taxReplenishmentsErrorAtom,
  taxReplenishmentsLoadingAtom,
  taxesMonthAtom,
  taxesStudentIdAtom,
} from '../atoms/taxes';
import { currentMonthKey } from '../utils/taxMonth';

export async function loadTaxes(get: Getter, set: Setter): Promise<void> {
  const tutor = get(tutorAtom);
  if (!tutor) return;

  let month = get(taxesMonthAtom);
  if (!month) {
    month = currentMonthKey(tutor.timezone);
    set(taxesMonthAtom, month);
  }

  const studentId = get(taxesStudentIdAtom);

  set(taxReplenishmentsLoadingAtom, true);
  set(taxReplenishmentsErrorAtom, null);
  try {
    const rows = await api.taxReplenishments(month, studentId ?? undefined);
    set(taxReplenishmentsAtom, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить налоги';
    set(taxReplenishmentsErrorAtom, message);
    set(taxReplenishmentsAtom, []);
  } finally {
    set(taxReplenishmentsLoadingAtom, false);
  }
}
