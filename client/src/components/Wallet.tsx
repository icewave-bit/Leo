import { fmtBalanceAmount, fmtMoney, lessonCountLabel } from '../utils/format';
import type { ViewStudent } from '../utils/schedule';

function balanceAsLessons(student: ViewStudent): number | null {
  const net = student.prepaid - student.debt;
  if (student.balanceKind === 'lessons') return net;
  if (student.rate == null || student.rate <= 0) return null;
  return net / student.rate;
}

export function Wallet({ student, compact }: { student: ViewStudent; compact?: boolean }) {
  const { prepaid, debt, currency, balanceKind } = student;
  const net = prepaid - debt;
  const lessonsNet = balanceAsLessons(student);
  const max = Math.max(Math.abs(prepaid), Math.abs(debt), 1);
  const ratio = Math.max(-1, Math.min(1, net / max));
  const tilt = -ratio * 9;
  const state = net > 0 ? 'credit' : net < 0 ? 'debt' : 'even';
  const fmtStored = (n: number) => fmtBalanceAmount(n, balanceKind, currency);
  const prepaidLabel = balanceKind === 'lessons' ? 'Оплачено уроков' : 'Предоплата';
  const debtLabel = balanceKind === 'lessons' ? 'Долг (уроков)' : 'Долг';

  const netLessonsLabel =
    lessonsNet != null
      ? (lessonsNet < 0 ? '−' : lessonsNet > 0 ? '+' : '') +
        lessonCountLabel(Math.abs(lessonsNet))
      : fmtStored(net);
  const netMoneyLabel =
    balanceKind === 'lessons' && student.rate != null
      ? fmtMoney(lessonsNet! * student.rate, currency)
      : balanceKind === 'money'
        ? fmtStored(net)
        : null;

  return (
    <div
      className={
        'wallet wallet--' +
        state +
        (compact ? ' wallet--compact' : '') +
        ' wallet--lessons'
      }
    >
      <div className="wallet__beam-wrap">
        <div className="wallet__pivot" />
        <div className="wallet__beam" style={{ transform: `rotate(${tilt}deg)` }}>
          <div className="wallet__arm wallet__arm--credit">
            <span className="wallet__pan wallet__pan--credit">
              <span className="wallet__pan-amt">{fmtStored(prepaid)}</span>
            </span>
          </div>
          <div className="wallet__arm wallet__arm--debt">
            <span className="wallet__pan wallet__pan--debt">
              <span className="wallet__pan-amt">{fmtStored(debt)}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="wallet__legend">
        <span className="wallet__leg">
          <i className="dot dot--credit" />
          {prepaidLabel}
        </span>
        <span className="wallet__net">
          {net === 0 ? (
            'Баланс нулевой'
          ) : (
            <>
              <span className="wallet__net-primary">{netLessonsLabel}</span>
              {netMoneyLabel ? (
                <span className="wallet__net-secondary">{netMoneyLabel}</span>
              ) : null}
            </>
          )}
        </span>
        <span className="wallet__leg wallet__leg--r">
          {debtLabel}
          <i className="dot dot--debt" />
        </span>
      </div>
    </div>
  );
}
