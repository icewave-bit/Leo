import type { JournalRow } from '../../utils/paymentJournal';
import type { ViewStudent } from '../../utils/schedule';
import { JournalStudentChip } from './JournalStudentChip';

export function JournalEntryCard({
  row,
  showStudent,
  students,
}: {
  row: JournalRow & { runningNet: string };
  showStudent: boolean;
  students: Map<string, ViewStudent>;
}) {
  const allocations = row.allocations;
  const hasAllocations = Boolean(allocations && allocations.length > 0);

  const head = (
    <>
      <time className="pay-entry__when">{row.whenLabel}</time>
      <span className={'pay-op pay-op--' + row.tone}>{row.title}</span>
    </>
  );

  return (
    <article className="pay-entry">
      {hasAllocations ? (
        <details className="pay-entry__compound">
          <summary className="pay-entry__compound-summary">{head}</summary>
          <ul className="pay-entry__allocs">
            {allocations!.map((a) => (
              <li key={a.id} className="pay-entry__alloc">
                <span className="pay-entry__alloc-title">{a.title}</span>
                <span className="pay-entry__alloc-amount tnum">{a.amountLabel}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <header className="pay-entry__head">{head}</header>
      )}

      {showStudent ? (
        <JournalStudentChip
          studentId={row.studentId}
          chargedForStudentId={row.chargedForStudentId}
          name={row.studentName}
          students={students}
        />
      ) : null}

      <dl className="pay-entry__amounts">
        <div className="pay-entry__amount">
          <dt>Сумма</dt>
          <dd className="tnum">{row.amountLabel}</dd>
        </div>
        <div className="pay-entry__amount pay-entry__amount--net">
          <dt>Баланс</dt>
          <dd className="tnum">{row.runningNet}</dd>
        </div>
      </dl>
    </article>
  );
}
