import { fmtBalanceAmount, fmtMoney, lessonCountLabel } from '../utils/format';
import {
  balanceNetAsLessons,
  balanceNetAsMoney,
} from '../utils/balanceConvert';
import type { ViewStudent } from '../utils/schedule';

function signedNetLabel(net: number, formatAbs: (n: number) => string): string {
  if (net === 0) return formatAbs(0);
  const sign = net < 0 ? '−' : '+';
  return sign + formatAbs(Math.abs(net));
}

export function Wallet({ student, compact }: { student: ViewStudent; compact?: boolean }) {
  const { prepaid, debt, currency, balanceKind, rate } = student;
  const net = prepaid - debt;
  const lessonsNet = balanceNetAsLessons(prepaid, debt, balanceKind, rate);
  const moneyNet = balanceNetAsMoney(prepaid, debt, balanceKind, rate);
  const max = Math.max(Math.abs(prepaid), Math.abs(debt), 1);
  const ratio = Math.max(-1, Math.min(1, net / max));
  const tilt = -ratio * 9;
  const state = net > 0 ? 'credit' : net < 0 ? 'debt' : 'even';
  const fmtStored = (n: number) => fmtBalanceAmount(n, balanceKind, currency);
  const prepaidLabel = balanceKind === 'lessons' ? 'Оплачено уроков' : 'Предоплата';
  const debtLabel = balanceKind === 'lessons' ? 'Долг (уроков)' : 'Долг';

  const primaryNetLabel =
    balanceKind === 'lessons'
      ? lessonsNet != null
        ? signedNetLabel(lessonsNet, lessonCountLabel)
        : fmtStored(net)
      : moneyNet != null
        ? signedNetLabel(moneyNet, (n) => fmtMoney(n, currency))
        : fmtStored(net);

  const secondaryNetLabel =
    balanceKind === 'lessons' && moneyNet != null
      ? signedNetLabel(moneyNet, (n) => fmtMoney(n, currency))
      : balanceKind === 'money' && lessonsNet != null
        ? signedNetLabel(lessonsNet, lessonCountLabel)
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
              <span className="wallet__net-primary">{primaryNetLabel}</span>
              {secondaryNetLabel ? (
                <span className="wallet__net-secondary">{secondaryNetLabel}</span>
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
