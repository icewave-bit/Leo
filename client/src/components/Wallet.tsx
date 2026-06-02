import { fmtBalanceAmount } from '../utils/format';
import type { ViewStudent } from '../utils/schedule';

export function Wallet({ student, compact }: { student: ViewStudent; compact?: boolean }) {
  const { prepaid, debt, currency, balanceKind } = student;
  const net = prepaid - debt;
  const max = Math.max(prepaid, debt, 1);
  const ratio = Math.max(-1, Math.min(1, net / max));
  const tilt = -ratio * 9;
  const state = net > 0 ? 'credit' : net < 0 ? 'debt' : 'even';
  const fmt = (n: number) => fmtBalanceAmount(n, balanceKind, currency);
  const prepaidLabel = balanceKind === 'lessons' ? 'Оплачено уроков' : 'Предоплата';
  const debtLabel = balanceKind === 'lessons' ? 'Долг (уроков)' : 'Долг';

  return (
    <div
      className={
        'wallet wallet--' +
        state +
        (compact ? ' wallet--compact' : '') +
        (balanceKind === 'lessons' ? ' wallet--lessons' : '')
      }
    >
      <div className="wallet__beam-wrap">
        <div className="wallet__pivot" />
        <div className="wallet__beam" style={{ transform: `rotate(${tilt}deg)` }}>
          <div className="wallet__arm wallet__arm--credit">
            <span className="wallet__pan wallet__pan--credit">
              <span className="wallet__pan-amt">{fmt(prepaid)}</span>
            </span>
          </div>
          <div className="wallet__arm wallet__arm--debt">
            <span className="wallet__pan wallet__pan--debt">
              <span className="wallet__pan-amt">{fmt(debt)}</span>
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
          {net === 0
            ? 'Баланс нулевой'
            : net > 0
              ? `Кредит ${fmt(net)}`
              : `Долг ${fmt(-net)}`}
        </span>
        <span className="wallet__leg wallet__leg--r">
          {debtLabel}
          <i className="dot dot--debt" />
        </span>
      </div>
    </div>
  );
}
