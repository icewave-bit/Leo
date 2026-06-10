import type { MouseEvent } from 'react';
import type { BalanceKind } from '../../api/types';
import { GearIcon } from '../Icon';
import { avatarHueStyle } from '../../utils/avatarStyle';
import { fmtMoney } from '../../utils/format';
import { isBillingDependent } from '../../utils/billingStudent';
import { studentListBalanceLabel } from '../../utils/studentBalanceDisplay';
import type { ViewStudent } from '../../utils/schedule';

export interface StudentCardProps {
  student: ViewStudent;
  students: ViewStudent[];
  balanceDisplay: BalanceKind;
  onReplenish: () => void;
  onOpenProfile: (e: MouseEvent) => void;
}

export function StudentCard({
  student,
  students,
  balanceDisplay,
  onReplenish,
  onOpenProfile,
}: StudentCardProps) {
  const dependent = isBillingDependent(student);
  const net = student.prepaid - student.debt;
  const balanceLabel = studentListBalanceLabel(student, students, balanceDisplay);
  const tone = dependent
    ? student.openLessonDebt > 0
      ? 'debt'
      : 'even'
    : net > 0
      ? 'credit'
      : net < 0
        ? 'debt'
        : 'even';
  const meta = [
    dependent ? (student.openLessonDebt > 0 ? 'Долг за уроки' : 'Общий счёт') : null,
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
        aria-label={
          dependent ? `Баланс: ${student.name}` : `Пополнить баланс: ${student.name}`
        }
        onClick={onReplenish}
      >
        <header className="student-card__head">
          <span className="student-card__who">
            <span
              className="avatar avatar--sm"
              style={avatarHueStyle(student.hue)}
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
