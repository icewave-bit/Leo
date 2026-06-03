import {
  balanceNetAsLessons,
  balanceNetAsMoney,
} from '../utils/balanceConvert';
import { fmtBalanceNet, fmtMoney, lessonCountLabel } from '../utils/format';
import type { ViewStudent } from '../utils/schedule';

function signedNetLabel(net: number, formatAbs: (n: number) => string): string {
  if (net === 0) return formatAbs(0);
  const sign = net < 0 ? '−' : '+';
  return sign + formatAbs(Math.abs(net));
}

export interface StudentBalanceProps {
  student: ViewStudent;
  compact?: boolean;
  className?: string;
}

export function StudentBalance({ student, compact, className }: StudentBalanceProps) {
  const { prepaid, debt, currency, balanceKind, rate } = student;
  const net = prepaid - debt;
  const netLabel = fmtBalanceNet(prepaid, debt, balanceKind, currency);
  const tone = net > 0 ? 'credit' : net < 0 ? 'debt' : 'even';

  const lessonsNet = balanceNetAsLessons(prepaid, debt, balanceKind, rate);
  const moneyNet = balanceNetAsMoney(prepaid, debt, balanceKind, rate);
  const secondary =
    balanceKind === 'lessons' && moneyNet != null
      ? signedNetLabel(moneyNet, (n) => fmtMoney(n, currency))
      : balanceKind === 'money' && lessonsNet != null
        ? signedNetLabel(lessonsNet, lessonCountLabel)
        : null;

  const rootClass =
    'student-balance student-balance--' +
    tone +
    (compact ? ' student-balance--compact' : '') +
    (className ? ` ${className}` : '');

  return (
    <div className={rootClass}>
      <p className={`student-balance__net tnum student-balance__net--${tone}`}>{netLabel}</p>
      {secondary ? <p className="student-balance__secondary tnum">{secondary}</p> : null}
    </div>
  );
}
