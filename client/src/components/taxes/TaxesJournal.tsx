import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { api } from '../../api/client';
import type { TaxDisplayCurrency, TaxReplenishment } from '../../api/types';
import { tutorAtom } from '../../atoms/auth';
import {
  taxReplenishmentsAtom,
  taxReplenishmentsErrorAtom,
  taxReplenishmentsLoadingAtom,
  taxesMonthAtom,
  taxesPaidFilterAtom,
  taxesSortAtom,
  taxesStudentIdAtom,
  type TaxesPaidFilter,
} from '../../atoms/taxes';
import { studentsAtom } from '../../atoms/schedule';
import { useAppStore } from '../../hooks/useAppStore';
import { loadTaxes } from '../../state/loadTaxes';
import { ConfirmDialog } from '../ConfirmDialog';
import { taxFromBase, taxRowBase } from '../../utils/taxAmount';
import { sortTaxRows, toggleTaxSort, type TaxSortKey } from '../../utils/taxJournalSort';
import { monthLabel } from '../../utils/taxMonth';
import { StudentPicker } from '../payments/StudentPicker';
import { MonthPicker } from './MonthPicker';
import { TaxPaidFilter } from './TaxPaidFilter';
import { TaxEntryDialog } from './TaxEntryDialog';
import { TaxJournalColgroup, taxJournalTableLayout } from './TaxJournalColgroup';
import { TaxJournalEntryCard } from './TaxJournalEntryCard';
import { TaxRowUndoCard, TaxRowUndoTable } from './TaxRowUndo';
import { TaxSummaryStrip } from './TaxSummaryStrip';
import { TaxSortableTh } from './TaxSortableTh';
import { TaxTableRow } from './TaxTableRow';

const DELETE_UNDO_MS = 10_000;

function matchesPaidFilter(row: TaxReplenishment, filter: TaxesPaidFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return row.taxPaid;
  return !row.taxPaid;
}

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
  const paidFilter = useAtomValue(taxesPaidFilterAtom);
  const [sort, setSort] = useAtom(taxesSortAtom);
  const month = useAtomValue(taxesMonthAtom);
  const [, setRows] = useAtom(taxReplenishmentsAtom);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxReplenishment | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesPaidFilter(r, paidFilter)),
    [rows, paidFilter],
  );

  const feedRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          pendingDeletes[r.movementId] != null || matchesPaidFilter(r, paidFilter),
      ),
    [rows, paidFilter, pendingDeletes],
  );

  const summaryRows = useMemo(
    () => filteredRows.filter((r) => pendingDeletes[r.movementId] == null),
    [filteredRows, pendingDeletes],
  );

  const tableRows = useMemo(
    () => sortTaxRows(feedRows, sort, taxRatePercent, displayCurrency),
    [feedRows, sort, taxRatePercent, displayCurrency],
  );

  const onSortColumn = useCallback(
    (key: TaxSortKey) => setSort((prev) => toggleTaxSort(prev, key)),
    [setSort],
  );

  const tableColSpan =
    6 + (showStudentColumn ? 1 : 0) + (showByn ? 1 : 0);

  useEffect(() => {
    const timers = deleteTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const commitDelete = useCallback(
    async (movementId: string) => {
      const timer = deleteTimersRef.current.get(movementId);
      if (timer) clearTimeout(timer);
      deleteTimersRef.current.delete(movementId);
      setPendingDeletes((prev) => {
        const next = { ...prev };
        delete next[movementId];
        return next;
      });

      setRows((prev) => prev.filter((r) => r.movementId !== movementId));
      try {
        await api.deleteTaxReplenishment(movementId);
      } catch {
        await loadTaxes(store.get, store.set);
      }
    },
    [setRows, store],
  );

  const startPendingDelete = useCallback(
    (row: TaxReplenishment) => {
      const { movementId } = row;
      const expiresAt = Date.now() + DELETE_UNDO_MS;
      setPendingDeletes((prev) => ({ ...prev, [movementId]: expiresAt }));
      setDeleteTarget(null);

      const existing = deleteTimersRef.current.get(movementId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        void commitDelete(movementId);
      }, DELETE_UNDO_MS);
      deleteTimersRef.current.set(movementId, timer);
    },
    [commitDelete],
  );

  const undoDelete = useCallback((movementId: string) => {
    const timer = deleteTimersRef.current.get(movementId);
    if (timer) clearTimeout(timer);
    deleteTimersRef.current.delete(movementId);
    setPendingDeletes((prev) => {
      const next = { ...prev };
      delete next[movementId];
      return next;
    });
  }, []);

  const summary = useMemo(() => {
    let totalByn = 0;
    let bynCount = 0;
    let totalTax = 0;
    let taxCount = 0;
    let taxPaidCount = 0;
    for (const r of summaryRows) {
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
    return { totalByn, bynCount, totalTax, taxCount, taxPaidCount, count: summaryRows.length };
  }, [summaryRows, showByn, displayCurrency, taxRatePercent]);

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
      const prev = rows.find((r) => r.movementId === movementId);
      if (!prev) return;
      setRows(
        rows.map((r) =>
          r.movementId === movementId ? { ...r, replenishmentDate: receivedOn } : r,
        ),
      );
      setSavingId(movementId);
      try {
        await api.patchTaxReplenishment(movementId, { receivedOn });
        await loadTaxes(store.get, store.set);
      } catch {
        setRows(
          rows.map((r) =>
            r.movementId === movementId
              ? { ...r, replenishmentDate: prev.replenishmentDate }
              : r,
          ),
        );
      } finally {
        setSavingId(null);
      }
    },
    [rows, setRows, store],
  );

  const taxColLabel =
    taxRatePercent > 0 ? `Налог (${taxRatePercent}%)` : 'Налог';

  const sharedRowProps = (r: TaxReplenishment) => ({
    row: r,
    showStudent: showStudentColumn,
    showByn,
    taxRatePercent,
    displayCurrency,
    weekStartsOn,
    students: studentMap,
    saving: savingId === r.movementId,
    onTaxPaidChange: (taxPaid: boolean) => saveMeta(r.movementId, { taxPaid }),
    onCommentBlur: (comment: string) => {
      if (comment !== r.comment) saveMeta(r.movementId, { comment });
    },
    onReceivedOnSave: (receivedOn: string) => saveReceivedOn(r.movementId, receivedOn),
    onDelete: () => setDeleteTarget(r),
  });

  return (
    <div className="tax-journal-page">
      <div className="tax-journal-controls">
        <section className="pay-toolbar" aria-label="Фильтры налогов">
          <div className="pay-toolbar__fields">
            <div className="pay-toolbar__field pay-toolbar__field--student">
              <span className="pay-toolbar__lbl">Ученик</span>
              <StudentPicker students={taxStudents} value={studentId} onChange={setStudentId} />
            </div>
            <div className="pay-toolbar__field pay-toolbar__field--month">
              <span className="pay-toolbar__lbl">Месяц</span>
              <MonthPicker />
            </div>
            <div className="pay-toolbar__field pay-toolbar__field--paid">
              <span className="pay-toolbar__lbl">Уплачен</span>
              <TaxPaidFilter />
            </div>
          </div>

          <div className="pay-toolbar__bar">
            <p className="pay-toolbar__range">{monthTitle}</p>
            <button
              type="button"
              className="btn btn--primary btn--sm pay-toolbar__replenish"
              onClick={() => setAddOpen(true)}
            >
              + Запись
            </button>
          </div>
        </section>

        <TaxSummaryStrip
          summary={summary}
          showByn={showByn}
          taxRatePercent={taxRatePercent}
          taxColLabel={taxColLabel}
        />

        {error ? (
          <p className="pay-journal-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="tax-journal-feed" aria-busy={loading}>
        {loading ? (
          <p className="pay-journal-empty">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="pay-journal-empty">
            {studentId
              ? 'За выбранный месяц поступлений нет.'
              : 'Нет поступлений за этот месяц.'}
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="pay-journal-empty">
            {paidFilter === 'paid'
              ? 'Нет уплаченных записей за этот месяц.'
              : 'Нет неуплаченных записей за этот месяц.'}
          </p>
        ) : (
          <>
            <ul className="tax-journal-list">
              {feedRows.map((r) => {
                const expiresAt = pendingDeletes[r.movementId];
                if (expiresAt != null) {
                  return (
                    <li key={r.movementId}>
                      <TaxRowUndoCard
                        expiresAt={expiresAt}
                        onUndo={() => undoDelete(r.movementId)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={r.movementId}>
                    <TaxJournalEntryCard
                      {...sharedRowProps(r)}
                      taxColLabel={taxColLabel}
                    />
                  </li>
                );
              })}
            </ul>

            <div className="tax-journal-table-wrap">
              <table
                className={
                  'tax-journal-table ' + taxJournalTableLayout(showStudentColumn, showByn)
                }
              >
                <TaxJournalColgroup showStudent={showStudentColumn} showByn={showByn} />
                <thead>
                  <tr>
                    <TaxSortableTh
                      label="Дата"
                      sortKey="date"
                      sort={sort}
                      className="tax-journal-table__when"
                      onSort={onSortColumn}
                    />
                    {showStudentColumn ? (
                      <TaxSortableTh
                        label="Ученик"
                        sortKey="student"
                        sort={sort}
                        className="tax-journal-table__col-student"
                        onSort={onSortColumn}
                      />
                    ) : null}
                    <TaxSortableTh
                      label="Сумма (в валюте)"
                      sortKey="amount"
                      sort={sort}
                      className="tax-journal-table__num tax-journal-table__col-amt"
                      onSort={onSortColumn}
                    />
                    {showByn ? (
                      <TaxSortableTh
                        label="BYN (НБРБ)"
                        sortKey="byn"
                        sort={sort}
                        className="tax-journal-table__num tax-journal-table__col-byn"
                        onSort={onSortColumn}
                      />
                    ) : null}
                    <TaxSortableTh
                      label={taxColLabel}
                      sortKey="tax"
                      sort={sort}
                      className="tax-journal-table__num tax-journal-table__col-tax"
                      onSort={onSortColumn}
                    />
                    <TaxSortableTh
                      label="Уплачен"
                      title="Уплачен"
                      sortKey="paid"
                      sort={sort}
                      className="tax-journal-table__tax"
                      onSort={onSortColumn}
                    />
                    <TaxSortableTh
                      label="Комментарий"
                      sortKey="comment"
                      sort={sort}
                      className="tax-journal-table__comment"
                      onSort={onSortColumn}
                    />
                    <th className="tax-journal-table__actions" aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => {
                    const expiresAt = pendingDeletes[r.movementId];
                    if (expiresAt != null) {
                      return (
                        <TaxRowUndoTable
                          key={r.movementId}
                          expiresAt={expiresAt}
                          colSpan={tableColSpan}
                          onUndo={() => undoDelete(r.movementId)}
                        />
                      );
                    }
                    return <TaxTableRow key={r.movementId} {...sharedRowProps(r)} />;
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <TaxEntryDialog
        open={addOpen}
        students={taxStudents}
        defaultStudentId={studentId}
        onClose={() => setAddOpen(false)}
        onCreated={() => void loadTaxes(store.get, store.set)}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Удалить из налогов?"
        description="Строка исчезнет из налогового журнала через 10 секунд. Баланс ученика и журнал оплат не изменятся."
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) startPendingDelete(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
