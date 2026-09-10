import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { tutorAtom } from '../../atoms/auth';
import {
  balanceMovementsAtom,
  balanceMovementsErrorAtom,
  balanceMovementsLoadingAtom,
  paymentsCustomFromAtom,
  paymentsCustomToAtom,
  paymentsPeriodAtom,
  paymentsStudentIdAtom,
} from '../../atoms/payments';
import {
  studentsAtom,
  balanceReplenishStudentIdAtom,
  balanceCorrectionStudentIdAtom,
} from '../../atoms/schedule';
import { findBillingPayer, isBillingDependent } from '../../utils/billingStudent';
import { fmtBalanceAmount } from '../../utils/format';
import {
  attachRunningBalance,
  buildJournalRows,
  mainTimelineMovements,
  movementsHaveMixedUnits,
  periodDeltaSummary,
  periodRange,
} from '../../utils/paymentJournal';
import { StudentBalance } from '../StudentBalance';
import { BillingPayerLink } from '../students/BillingPayerLink';
import { JournalEntryCard } from './JournalEntryCard';
import { JournalStudentChip } from './JournalStudentChip';
import { PeriodPicker } from './PeriodPicker';
import { StudentPicker } from './StudentPicker';

export function PaymentsJournal() {
  const navigate = useNavigate();
  const tutor = useAtomValue(tutorAtom);
  const students = useAtomValue(studentsAtom);
  const movements = useAtomValue(balanceMovementsAtom);
  const loading = useAtomValue(balanceMovementsLoadingAtom);
  const error = useAtomValue(balanceMovementsErrorAtom);
  const [studentId, setStudentId] = useAtom(paymentsStudentIdAtom);
  const period = useAtomValue(paymentsPeriodAtom);
  const customFrom = useAtomValue(paymentsCustomFromAtom);
  const customTo = useAtomValue(paymentsCustomToAtom);
  const setReplenishId = useSetAtom(balanceReplenishStudentIdAtom);
  const setCorrectionId = useSetAtom(balanceCorrectionStudentIdAtom);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const periodLabel = periodRange(period, tz, { from: customFrom, to: customTo }, new Date(), weekStartsOn).label;

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const selectedStudent = studentId ? studentMap.get(studentId) : undefined;
  const balanceStudent = selectedStudent
    ? findBillingPayer(students, selectedStudent) ?? selectedStudent
    : undefined;
  const selectedDependent = selectedStudent ? isBillingDependent(selectedStudent) : false;
  const canActOnWallet =
    Boolean(selectedStudent) &&
    !selectedStudent?.group &&
    !selectedDependent;

  const rows = useMemo(() => {
    const grouped = buildJournalRows(movements, studentMap, tz);
    return attachRunningBalance(grouped);
  }, [movements, studentMap, tz]);

  const summary = useMemo(
    () => periodDeltaSummary(movements, selectedStudent),
    [movements, selectedStudent],
  );

  const summaryMixedUnits = useMemo(
    () => movementsHaveMixedUnits(mainTimelineMovements(movements), selectedStudent),
    [movements, selectedStudent],
  );

  const showStudentColumn = !studentId;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="pay-journal-page">
      <section className="pay-toolbar" aria-label="Фильтры журнала">
        <div className="pay-toolbar__fields">
          <div className="pay-toolbar__field pay-toolbar__field--student">
            <span className="pay-toolbar__lbl">Ученик</span>
            <StudentPicker students={students} value={studentId} onChange={setStudentId} />
          </div>
          <div className="pay-toolbar__field pay-toolbar__field--period">
            <span className="pay-toolbar__lbl">Период</span>
            <PeriodPicker timezone={tz} />
          </div>
        </div>

        <div className="pay-toolbar__bar">
          <p className="pay-toolbar__range">{periodLabel}</p>
        </div>
      </section>

      {selectedStudent && balanceStudent ? (
        <section className="pay-summary">
          {selectedDependent ? (
            <div className="pay-summary__dependent">
              <p className="drawer-panel__hint">
                Личный баланс не ведётся — операции с кошельком только у плательщика.
              </p>
              <p className="pay-summary__dependent-debt tnum">
                Долг за уроки:{' '}
                <strong>
                  {selectedStudent.openLessonDebt > 0
                    ? fmtBalanceAmount(
                        selectedStudent.openLessonDebt,
                        balanceStudent.balanceKind,
                        balanceStudent.currency,
                      )
                    : 'нет'}
                </strong>
              </p>
              <BillingPayerLink
                payerId={balanceStudent.id}
                payerName={balanceStudent.name}
                onOpen={(id) => navigate(`/students/${id}`)}
              />
            </div>
          ) : (
            <>
              <StudentBalance student={balanceStudent} compact />
              <div className="pay-summary__stats">
                {summary ? (
                  <div className="pay-summary__stat">
                    <span className="pay-summary__stat-lbl">За период</span>
                    <span className="pay-summary__stat-val tnum">{summary.net}</span>
                  </div>
                ) : summaryMixedUnits ? (
                  <p className="pay-summary__mixed-hint">
                    За период есть операции в рублях и в уроках — итог по строкам смотрите в
                    списке.
                  </p>
                ) : null}
              </div>
              {canActOnWallet ? (
                <div className="pay-summary__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setReplenishId(null);
                      setCorrectionId(selectedStudent.id);
                    }}
                  >
                    Корректировка
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setCorrectionId(null);
                      setReplenishId(selectedStudent.id);
                    }}
                  >
                    Пополнить
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="pay-journal-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="pay-journal-feed" aria-busy={loading}>
        {loading ? (
          <p className="pay-journal-empty">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="pay-journal-empty">
            {studentId
              ? 'За выбранный период операций нет.'
              : 'Нет операций за этот период.'}
          </p>
        ) : (
          <>
            <ul className="pay-journal-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <JournalEntryCard
                    row={r}
                    showStudent={showStudentColumn}
                    students={studentMap}
                  />
                </li>
              ))}
            </ul>

            <div className="pay-journal-table-wrap">
              <table className="pay-journal-table">
                <thead>
                  <tr>
                    <th>Когда</th>
                    {showStudentColumn ? <th>Ученик</th> : null}
                    <th>Операция</th>
                    <th className="pay-journal-table__num">Сумма</th>
                    <th className="pay-journal-table__num">Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const hasAllocations = Boolean(r.allocations && r.allocations.length > 0);
                    const expanded = hasAllocations && expandedIds.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <tr className={hasAllocations ? 'pay-journal-table__parent' : undefined}>
                          <td className="pay-journal-table__when">{r.whenLabel}</td>
                          {showStudentColumn ? (
                            <td>
                              <JournalStudentChip
                                studentId={r.studentId}
                                chargedForStudentId={r.chargedForStudentId}
                                name={r.studentName}
                                students={studentMap}
                              />
                            </td>
                          ) : null}
                          <td>
                            {hasAllocations ? (
                              <button
                                type="button"
                                className="pay-journal-table__toggle"
                                aria-expanded={expanded}
                                onClick={() => toggleExpanded(r.id)}
                              >
                                <span
                                  className="pay-journal-table__chevron"
                                  aria-hidden
                                >
                                  {expanded ? '▾' : '▸'}
                                </span>
                                <span className={'pay-op pay-op--' + r.tone}>{r.title}</span>
                              </button>
                            ) : (
                              <span className={'pay-op pay-op--' + r.tone}>{r.title}</span>
                            )}
                          </td>
                          <td className="tnum pay-journal-table__num pay-journal-table__delta">
                            {r.amountLabel}
                          </td>
                          <td className="tnum pay-journal-table__num pay-journal-table__net">
                            {r.runningNet}
                          </td>
                        </tr>
                        {expanded
                          ? r.allocations!.map((a) => (
                              <tr key={a.id} className="pay-journal-table__alloc-row">
                                <td className="pay-journal-table__when" />
                                {showStudentColumn ? <td /> : null}
                                <td className="pay-journal-table__alloc-cell">
                                  <span className="pay-journal-table__alloc-title">{a.title}</span>
                                </td>
                                <td className="tnum pay-journal-table__num pay-journal-table__alloc-amount">
                                  {a.amountLabel}
                                </td>
                                <td className="tnum pay-journal-table__num pay-journal-table__alloc-net">
                                  —
                                </td>
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
