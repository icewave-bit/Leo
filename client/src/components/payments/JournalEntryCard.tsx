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
  return (
    <article className="pay-entry">
      <header className="pay-entry__head">
        <time className="pay-entry__when">{row.whenLabel}</time>
        <span className={'pay-op pay-op--' + row.tone}>{row.title}</span>
      </header>

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
          <dt>Предоплата</dt>
          <dd className="tnum">{row.prepaidLabel}</dd>
        </div>
        <div className="pay-entry__amount">
          <dt>Долг</dt>
          <dd className="tnum">{row.debtLabel}</dd>
        </div>
        <div className="pay-entry__amount pay-entry__amount--net">
          <dt>Баланс</dt>
          <dd className="tnum">{row.runningNet}</dd>
        </div>
      </dl>
    </article>
  );
}
