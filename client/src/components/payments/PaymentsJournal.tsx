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
  periodDeltaSummary,
  periodRange,
} from '../../utils/paymentJournal';
import { fmtBalanceNet } from '../../utils/format';
import { Wallet } from '../Wallet';
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
  const periodLabel = periodRange(period, tz, { from: customFrom, to: customTo }).label;

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const selectedStudent = studentId ? studentMap.get(studentId) : undefined;

  const rows = useMemo(() => {
    const enriched = enrichMovements(movements, studentMap, tz);
    return attachRunningBalance(enriched, selectedStudent);
  }, [movements, studentMap, tz, selectedStudent]);

  const summary = useMemo(
    () => periodDeltaSummary(movements, selectedStudent),
    [movements, selectedStudent],
  );

  const showStudentColumn = !studentId;

  return (
    <div className="pay-journal-page">
      <section className="pay-toolbar" aria-label="Фильтры журнала">
        <span className="pay-toolbar__lbl pay-toolbar__lbl--student">Ученик</span>
        <span className="pay-toolbar__lbl pay-toolbar__lbl--period">Период</span>
        <span className="pay-toolbar__lbl pay-toolbar__lbl--actions" aria-hidden />

        <div className="pay-toolbar__control pay-toolbar__control--student">
          <StudentPicker students={students} value={studentId} onChange={setStudentId} />
        </div>

        <div className="pay-toolbar__control pay-toolbar__control--period">
          <PeriodPicker timezone={tz} />
        </div>

        <div className="pay-toolbar__actions">
          {selectedStudent && !selectedStudent.group ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setReplenishId(selectedStudent.id)}
            >
              Пополнить
            </button>
          ) : null}
        </div>

        <p className="pay-toolbar__range">{periodLabel}</p>
      </section>

      {selectedStudent ? (
        <section className="pay-summary">
          <Wallet student={selectedStudent} compact />
          <div className="pay-summary__stats">
            <div className="pay-summary__stat">
              <span className="pay-summary__stat-lbl">Сейчас</span>
              <strong className="pay-summary__stat-val tnum">
                {fmtBalanceNet(
                  selectedStudent.prepaid,
                  selectedStudent.debt,
                  selectedStudent.balanceKind,
                  selectedStudent.currency,
                )}
              </strong>
            </div>
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
