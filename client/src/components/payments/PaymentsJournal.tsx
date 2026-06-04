import { useMemo } from 'react';
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
import { studentsAtom, balanceReplenishStudentIdAtom } from '../../atoms/schedule';
import {
  attachRunningBalance,
  enrichMovements,
  movementsHaveMixedUnits,
  periodDeltaSummary,
  periodRange,
} from '../../utils/paymentJournal';
import { StudentBalance } from '../StudentBalance';
import { JournalEntryCard } from './JournalEntryCard';
import { JournalStudentChip } from './JournalStudentChip';
import { PeriodPicker } from './PeriodPicker';
import { StudentPicker } from './StudentPicker';

export function PaymentsJournal() {
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

  const tz = tutor?.timezone ?? 'UTC';
  const weekStartsOn = tutor?.weekStartsOn ?? 'monday';
  const periodLabel = periodRange(period, tz, { from: customFrom, to: customTo }, new Date(), weekStartsOn).label;

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const selectedStudent = studentId ? studentMap.get(studentId) : undefined;

  const rows = useMemo(() => {
    const enriched = enrichMovements(movements, studentMap, tz);
    return attachRunningBalance(enriched);
  }, [movements, studentMap, tz]);

  const summary = useMemo(
    () => periodDeltaSummary(movements, selectedStudent),
    [movements, selectedStudent],
  );

  const summaryMixedUnits = useMemo(
    () => movementsHaveMixedUnits(movements, selectedStudent),
    [movements, selectedStudent],
  );

  const showStudentColumn = !studentId;

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
          {selectedStudent && !selectedStudent.group ? (
            <button
              type="button"
              className="btn btn--primary btn--sm pay-toolbar__replenish"
              onClick={() => setReplenishId(selectedStudent.id)}
            >
              Пополнить
            </button>
          ) : null}
        </div>
      </section>

      {selectedStudent ? (
        <section className="pay-summary">
          <StudentBalance student={selectedStudent} compact />
          <div className="pay-summary__stats">
            {summary ? (
              <>
                <div className="pay-summary__stat">
                  <span className="pay-summary__stat-lbl">Предоплата</span>
                  <span className="pay-summary__stat-val tnum pay-summary__stat-val--muted">
                    {summary.prepaid}
                  </span>
                </div>
                <div className="pay-summary__stat">
                  <span className="pay-summary__stat-lbl">Долг</span>
                  <span className="pay-summary__stat-val tnum pay-summary__stat-val--muted">
                    {summary.debt}
                  </span>
                </div>
                <div className="pay-summary__stat">
                  <span className="pay-summary__stat-lbl">За период</span>
                  <span className="pay-summary__stat-val tnum">{summary.net}</span>
                </div>
              </>
            ) : summaryMixedUnits ? (
              <p className="pay-summary__mixed-hint">
                За период есть операции в рублях и в уроках — итог по строкам смотрите в списке.
              </p>
            ) : null}
          </div>
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
                    <th className="pay-journal-table__num">Предоплата</th>
                    <th className="pay-journal-table__num">Долг</th>
                    <th className="pay-journal-table__num">Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="pay-journal-table__when">{r.whenLabel}</td>
                      {showStudentColumn ? (
                        <td>
                          <JournalStudentChip
                            studentId={r.studentId}
                            name={r.studentName}
                            students={studentMap}
                          />
                        </td>
                      ) : null}
                      <td>
                        <span className={'pay-op pay-op--' + r.tone}>{r.title}</span>
                      </td>
                      <td className="tnum pay-journal-table__num pay-journal-table__delta">
                        {r.prepaidLabel}
                      </td>
                      <td className="tnum pay-journal-table__num pay-journal-table__delta">
                        {r.debtLabel}
                      </td>
                      <td className="tnum pay-journal-table__num pay-journal-table__net">
                        {r.runningNet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
