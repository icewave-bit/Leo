import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { api } from '../../api/client';
import type { TaxDisplayCurrency, TaxReplenishment, WeekStartsOn } from '../../api/types';
import { tutorAtom } from '../../atoms/auth';
import {
  taxReplenishmentsAtom,
  taxReplenishmentsErrorAtom,
  taxReplenishmentsLoadingAtom,
  taxesMonthAtom,
  taxesStudentIdAtom,
} from '../../atoms/taxes';
import { studentsAtom } from '../../atoms/schedule';
import { useAppStore } from '../../hooks/useAppStore';
import { loadTaxes } from '../../state/loadTaxes';
import { fmtDateKey } from '../../utils/dateKey';
import { fmtByn } from '../../utils/format';
import { fmtTaxAmount, fmtTaxDue } from '../../utils/taxDisplay';
import { taxFromBase, taxRowBase } from '../../utils/taxAmount';
import { monthLabel } from '../../utils/taxMonth';
import { JournalStudentChip } from '../payments/JournalStudentChip';
import { StudentPicker } from '../payments/StudentPicker';
import { MonthPicker } from './MonthPicker';

function patchRow(
  rows: TaxReplenishment[],
  movementId: string,
  patch: Partial<Pick<TaxReplenishment, 'taxPaid' | 'comment'>>,
): TaxReplenishment[] {
  return rows.map((r) =>
    r.movementId === movementId ? { ...r, ...patch } : r,
  );
}

export function TaxesJournal() {
  const tutor = useAtomValue(tutorAtom);
  const students = useAtomValue(studentsAtom);
  const rows = useAtomValue(taxReplenishmentsAtom);
  const loading = useAtomValue(taxReplenishmentsLoadingAtom);
  const error = useAtomValue(taxReplenishmentsErrorAtom);
  const [studentId, setStudentId] = useAtom(taxesStudentIdAtom);
  const month = useAtomValue(taxesMonthAtom);
  const [, setRows] = useAtom(taxReplenishmentsAtom);
  const [savingId, setSavingId] = useState<string | null>(null);
  const store = useAppStore();

  const monthTitle = month ? monthLabel(month) : '';
  const taxRatePercent = tutor?.taxRatePercent ?? 10;
  const displayCurrency: TaxDisplayCurrency = tutor?.taxDisplayCurrency ?? 'BYN';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const showByn = displayCurrency === 'BYN';

  const taxStudents = useMemo(
    () => students.filter((s) => !s.excludeFromTaxes),
    [students],
  );

  const studentMap = useMemo(
    () => new Map(taxStudents.map((s) => [s.id, s])),
    [taxStudents],
  );

  useEffect(() => {
    if (studentId && !taxStudents.some((s) => s.id === studentId)) {
      setStudentId(null);
    }
  }, [studentId, taxStudents, setStudentId]);

  const showStudentColumn = !studentId;

  const summary = useMemo(() => {
    let totalByn = 0;
    let bynCount = 0;
    let totalTax = 0;
    let taxCount = 0;
    let taxPaidCount = 0;
    for (const r of rows) {
      if (r.taxPaid) taxPaidCount += 1;
      if (showByn && r.amountByn != null) {
        totalByn += r.amountByn;
        bynCount += 1;
      }
      const base = taxRowBase(r, displayCurrency);
      if (base != null && taxRatePercent > 0) {
        totalTax += taxFromBase(base, taxRatePercent);
        taxCount += 1;
      }
    }
    return { totalByn, bynCount, totalTax, taxCount, taxPaidCount, count: rows.length };
  }, [rows, showByn, displayCurrency, taxRatePercent]);

  const saveMeta = useCallback(
    async (movementId: string, patch: { taxPaid?: boolean; comment?: string }) => {
      const prev = rows.find((r) => r.movementId === movementId);
      if (!prev) return;
      setRows(patchRow(rows, movementId, patch));
      setSavingId(movementId);
      try {
        await api.patchTaxReplenishment(movementId, patch);
      } catch {
        setRows(patchRow(rows, movementId, { taxPaid: prev.taxPaid, comment: prev.comment }));
      } finally {
        setSavingId(null);
      }
    },
    [rows, setRows],
  );

  const saveReceivedOn = useCallback(
    async (movementId: string, receivedOn: string) => {
      setSavingId(movementId);
      try {
        await api.patchTaxReplenishment(movementId, { receivedOn });
        await loadTaxes(store.get, store.set);
      } finally {
        setSavingId(null);
      }
    },
    [store],
  );

  const taxColLabel =
    taxRatePercent > 0 ? `Налог (${taxRatePercent}%)` : 'Налог';

  return (
    <div className="tax-journal-page">
      <section className="pay-toolbar" aria-label="Фильтры налогов">
        <div className="pay-toolbar__fields">
          <div className="pay-toolbar__field pay-toolbar__field--student">
            <span className="pay-toolbar__lbl">Ученик</span>
            <StudentPicker students={taxStudents} value={studentId} onChange={setStudentId} />
          </div>
          <div className="pay-toolbar__field pay-toolbar__field--period">
            <span className="pay-toolbar__lbl">Месяц</span>
            <MonthPicker />
          </div>
        </div>

        <div className="pay-toolbar__bar">
          <p className="pay-toolbar__range">{monthTitle}</p>
          {summary.count > 0 ? (
            <p className="tax-summary-inline tnum">
              {showByn && summary.bynCount > 0 ? (
                <span>Итого {fmtByn(summary.totalByn)}</span>
              ) : null}
              {showByn && summary.bynCount > 0 && summary.taxCount > 0 ? ' · ' : null}
              {summary.taxCount > 0 && taxRatePercent > 0 ? (
                <span>
                  {taxColLabel}:{' '}
                  {showByn
                    ? fmtByn(summary.totalTax)
                    : 'по строкам'}
                </span>
              ) : null}
              {(showByn && summary.bynCount > 0) ||
              (summary.taxCount > 0 && taxRatePercent > 0)
                ? ' · '
                : null}
              <span>
                Уплачен: {summary.taxPaidCount}/{summary.count}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <p className="pay-journal-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="tax-journal-feed" aria-busy={loading}>
        {loading ? (
          <p className="pay-journal-empty">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="pay-journal-empty">
            {studentId
              ? 'За выбранный месяц пополнений нет.'
              : 'Нет пополнений за этот месяц.'}
          </p>
        ) : (
          <div className="tax-journal-table-wrap">
            <table className="tax-journal-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  {showStudentColumn ? <th>Ученик</th> : null}
                  <th className="tax-journal-table__num">Сумма (в валюте)</th>
                  {showByn ? (
                    <th className="tax-journal-table__num">BYN (НБРБ)</th>
                  ) : null}
                  <th className="tax-journal-table__num">{taxColLabel}</th>
                  <th className="tax-journal-table__tax">Уплачен</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <TaxRow
                    key={r.movementId}
                    row={r}
                    showStudent={showStudentColumn}
                    showByn={showByn}
                    taxRatePercent={taxRatePercent}
                    displayCurrency={displayCurrency}
                    students={studentMap}
                    saving={savingId === r.movementId}
                    onTaxPaidChange={(taxPaid) => saveMeta(r.movementId, { taxPaid })}
                    onCommentBlur={(comment) => {
                      if (comment !== r.comment) saveMeta(r.movementId, { comment });
                    }}
                    weekStartsOn={weekStartsOn}
                    onReceivedOnSave={(receivedOn) =>
                      saveReceivedOn(r.movementId, receivedOn)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TaxRow({
  row,
  showStudent,
  showByn,
  taxRatePercent,
  displayCurrency,
  weekStartsOn,
  students,
  saving,
  onTaxPaidChange,
  onCommentBlur,
  onReceivedOnSave,
}: {
  row: TaxReplenishment;
  showStudent: boolean;
  showByn: boolean;
  taxRatePercent: number;
  displayCurrency: TaxDisplayCurrency;
  weekStartsOn: WeekStartsOn;
  students: Map<string, import('../../utils/schedule').ViewStudent>;
  saving: boolean;
  onTaxPaidChange: (taxPaid: boolean) => void;
  onCommentBlur: (comment: string) => void;
  onReceivedOnSave: (receivedOn: string) => void;
}) {
  const [commentDraft, setCommentDraft] = useState(row.comment);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(row.replenishmentDate);

  const amountLabel = fmtTaxAmount(row);
  const bynLabel =
    row.amountByn != null ? fmtByn(row.amountByn) : (row.conversionError ?? '—');
  const taxLabel =
    taxRatePercent > 0
      ? (fmtTaxDue(row, taxRatePercent, displayCurrency) ?? '—')
      : '—';

  return (
    <tr className={saving ? 'tax-journal-table__row--saving' : undefined}>
      <td className="tax-journal-table__when">
        {editingDate ? (
          <input
            className="field__control tax-date-input"
            type="date"
            value={dateDraft}
            disabled={saving}
            autoFocus
            onChange={(e) => setDateDraft(e.target.value)}
            onBlur={() => {
              setEditingDate(false);
              if (dateDraft && dateDraft !== row.replenishmentDate) {
                void onReceivedOnSave(dateDraft);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDateDraft(row.replenishmentDate);
                setEditingDate(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="tax-date-btn"
            title="Изменить дату поступления"
            disabled={saving}
            onClick={() => {
              setDateDraft(row.replenishmentDate);
              setEditingDate(true);
            }}
          >
            {fmtDateKey(row.replenishmentDate, weekStartsOn)}
          </button>
        )}
      </td>
      {showStudent ? (
        <td>
          <JournalStudentChip
            studentId={row.studentId}
            name={row.studentName}
            students={students}
          />
        </td>
      ) : null}
      <td className="tnum tax-journal-table__num">{amountLabel}</td>
      {showByn ? (
        <td
          className={
            'tnum tax-journal-table__num' +
            (row.conversionError ? ' tax-journal-table__num--err' : '')
          }
          title={row.conversionError ?? `Курс на ${row.replenishmentDate}`}
        >
          {bynLabel}
        </td>
      ) : null}
      <td className="tnum tax-journal-table__num tax-journal-table__tax-amt">{taxLabel}</td>
      <td className="tax-journal-table__tax">
        <label className="tax-check">
          <input
            type="checkbox"
            checked={row.taxPaid}
            disabled={saving}
            onChange={(e) => onTaxPaidChange(e.target.checked)}
          />
          <span className="tax-check__lbl">Да</span>
        </label>
      </td>
      <td className="tax-journal-table__comment">
        <input
          className="field__control tax-comment-input"
          type="text"
          value={commentDraft}
          placeholder="Комментарий"
          disabled={saving}
          onChange={(e) => setCommentDraft(e.target.value)}
          onBlur={() => onCommentBlur(commentDraft)}
        />
      </td>
    </tr>
  );
}
