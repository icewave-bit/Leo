import type { MouseEvent } from 'react';
import { GearIcon } from '../Icon';
import { fmtBalanceNet, fmtMoney } from '../../utils/format';
import type { ViewStudent } from '../../utils/schedule';

export interface StudentCardProps {
  student: ViewStudent;
  onReplenish: () => void;
  onOpenProfile: (e: MouseEvent) => void;
}

export function StudentCard({ student, onReplenish, onOpenProfile }: StudentCardProps) {
  const net = student.prepaid - student.debt;
  const balanceLabel = fmtBalanceNet(
    student.prepaid,
    student.debt,
    student.balanceKind,
    student.currency,
  );
  const tone = net > 0 ? 'credit' : net < 0 ? 'debt' : 'even';
  const meta = [
    student.group ? `Группа · ${student.members.length} уч.` : 'Индивидуально',
    student.rate != null ? `${fmtMoney(student.rate, student.currency)}/ак. ч` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="student-card">
      <button
        type="button"
        className="student-card__open"
        aria-label={`Пополнить баланс: ${student.name}`}
        onClick={onReplenish}
      >
        <header className="student-card__head">
          <span className="student-card__who">
            <span
              className="avatar avatar--sm"
              style={{ background: `oklch(0.62 0.13 ${student.hue})` }}
            >
              {student.initials}
            </span>
            <span className="student-card__txt">
              <strong className="student-card__name">{student.name}</strong>
              <span className="student-card__meta">{meta}</span>
            </span>
          </span>
          <span className={`student-card__balance tnum student-card__balance--${tone}`}>
            {balanceLabel}
          </span>
        </header>
      </button>
      <button
        type="button"
        className="student-card__settings"
        aria-label={`Профиль: ${student.name}`}
        onClick={onOpenProfile}
      >
        <GearIcon size={22} />
      </button>
    </article>
  );
}
