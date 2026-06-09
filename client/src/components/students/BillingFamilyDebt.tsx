import type { BillingDebtBreakdown } from '../../api/types';
import { fmtBalanceAmount } from '../../utils/format';

export interface BillingFamilyDebtProps {
  breakdown: BillingDebtBreakdown;
  highlightStudentId?: string;
}

/** Только просмотр: строки не кликабельны и никуда не ведут. */
export function BillingFamilyDebt({ breakdown, highlightStudentId }: BillingFamilyDebtProps) {
  const { balanceKind, currency, entries } = breakdown;
  const withDebt = entries.filter((e) => e.openDebt > 0);

  if (withDebt.length === 0) {
    return (
      <p className="drawer-panel__hint billing-family-debt billing-family-debt--readonly">
        Нет неоплаченных уроков по счёту семьи.
      </p>
    );
  }

  return (
    <div className="billing-family-debt billing-family-debt--readonly" aria-readonly="true">
      <p className="billing-family-debt__title">Долг по ученикам</p>
      <p className="drawer-panel__hint billing-family-debt__note">
        Справочно — открыть профиль ученика из списка нельзя. Пополнение и баланс — только у
        плательщика.
      </p>
      <ul className="billing-family-debt__list">
        {withDebt.map((entry) => (
          <li
            key={entry.studentId}
            className={
              'billing-family-debt__row' +
              (entry.studentId === highlightStudentId ? ' billing-family-debt__row--self' : '')
            }
          >
            <span className="billing-family-debt__name">{entry.studentName}</span>
            <span className="billing-family-debt__amount tnum">
              {fmtBalanceAmount(entry.openDebt, balanceKind, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
