export function TaxJournalColgroup({
  showStudent,
  showByn,
}: {
  showStudent: boolean;
  showByn: boolean;
}) {
  return (
    <colgroup>
      <col className="tax-col-date" />
      {showStudent ? <col className="tax-col-student" /> : null}
      <col className="tax-col-amt" />
      {showByn ? <col className="tax-col-byn" /> : null}
      <col className="tax-col-tax" />
      <col className="tax-col-paid" />
      <col className="tax-col-comment" />
      <col className="tax-col-actions" />
    </colgroup>
  );
}

export function taxJournalTableLayout(showStudent: boolean, showByn: boolean): string {
  if (showStudent && showByn) return 'tax-journal-table--sb';
  if (showStudent) return 'tax-journal-table--s';
  if (showByn) return 'tax-journal-table--b';
  return 'tax-journal-table--plain';
}
