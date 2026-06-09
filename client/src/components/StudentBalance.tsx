import { fmtMoney, lessonCountLabel } from '../utils/format';
import type { ViewStudent } from '../utils/schedule';
import {
  storedWalletNet,
  walletLessonsNet,
  walletMoneyNet,
} from '../utils/walletCanonical';

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
  const storedNet = storedWalletNet(prepaid, debt, balanceKind);
  const tone = storedNet > 0 ? 'credit' : storedNet < 0 ? 'debt' : 'even';

  const netLabel =
    balanceKind === 'lessons'
      ? signedNetLabel(storedNet, lessonCountLabel)
      : signedNetLabel(storedNet, (n) => fmtMoney(n, currency));

  const moneyAtRate = walletMoneyNet(prepaid, debt, balanceKind, rate);
  const lessonsAtRate = walletLessonsNet(prepaid, debt, balanceKind, rate);
  const secondary =
    balanceKind === 'lessons' && rate != null && rate > 0
      ? signedNetLabel(moneyAtRate, (n) => fmtMoney(n, currency))
      : balanceKind === 'money' && lessonsAtRate != null
        ? signedNetLabel(lessonsAtRate, lessonCountLabel)
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
