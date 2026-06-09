export interface BillingPayerLinkProps {
  payerId: string;
  payerName: string;
  onOpen: (studentId: string) => void;
  className?: string;
}

/** Единственный переход к операциям с общим кошельком — профиль плательщика. */
export function BillingPayerLink({
  payerId,
  payerName,
  onOpen,
  className,
}: BillingPayerLinkProps) {
  return (
    <button
      type="button"
      className={'billing-payer-link' + (className ? ` ${className}` : '')}
      onClick={() => onOpen(payerId)}
    >
      Кошелёк: {payerName}
    </button>
  );
}
