import type { BalanceKind } from '../api/types';
import type { AcademicUnits } from '../api/types';
import { formatWalletChargeSummary } from '../utils/lessonBalance';

export interface LessonBalanceConfirmOptionsProps {
  walletBalanceKind: BalanceKind;
  walletRate: number | null;
  lessonRate: number | null;
  academicUnits: AcademicUnits;
  currency: string;
  balanceCharged: boolean;
  restoreBalance: boolean;
  onRestoreBalanceChange: (value: boolean) => void;
}

export function LessonBalanceConfirmOptions({
  walletBalanceKind,
  walletRate,
  lessonRate,
  academicUnits,
  currency,
  balanceCharged,
  restoreBalance,
  onRestoreBalanceChange,
}: LessonBalanceConfirmOptionsProps) {
  const chargeLabel = formatWalletChargeSummary(
    walletBalanceKind,
    walletRate,
    lessonRate,
    academicUnits,
    currency,
  );

  return (
    <div className="confirm__balance">
      <p className="confirm__balance-note">
        Урок уже завершён по времени
        {balanceCharged && chargeLabel
          ? ` и с баланса списано ${chargeLabel}.`
          : balanceCharged
            ? ' и баланс был списан.'
            : '.'}
      </p>
      {balanceCharged ? (
        <label className="confirm__balance-opt">
          <input
            type="checkbox"
            checked={restoreBalance}
            onChange={(e) => onRestoreBalanceChange(e.target.checked)}
          />
          <span>
            Вернуть списание на баланс
            {chargeLabel ? ` (${chargeLabel})` : ''}
          </span>
        </label>
      ) : chargeLabel ? (
        <p className="confirm__balance-hint">
          При проведении урока с баланса будет списано {chargeLabel}.
        </p>
      ) : null}
    </div>
  );
}
