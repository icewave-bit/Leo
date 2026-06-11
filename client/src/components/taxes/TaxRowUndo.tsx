import { useEffect, useState } from 'react';

function useUndoSecondsLeft(expiresAt: number) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}

function TaxUndoContent({ expiresAt, onUndo }: { expiresAt: number; onUndo: () => void }) {
  const secondsLeft = useUndoSecondsLeft(expiresAt);

  return (
    <div className="tax-row-undo" role="status">
      <span className="tax-row-undo__msg">Запись удалена из налогов</span>
      <button type="button" className="tax-row-undo__btn" onClick={onUndo}>
        Восстановить
      </button>
      <span className="tax-row-undo__timer tnum">{secondsLeft} с</span>
    </div>
  );
}

export function TaxRowUndoTable({
  expiresAt,
  colSpan,
  onUndo,
}: {
  expiresAt: number;
  colSpan: number;
  onUndo: () => void;
}) {
  return (
    <tr className="tax-journal-table__row--pending-delete">
      <td colSpan={colSpan}>
        <TaxUndoContent expiresAt={expiresAt} onUndo={onUndo} />
      </td>
    </tr>
  );
}

export function TaxRowUndoCard({
  expiresAt,
  onUndo,
}: {
  expiresAt: number;
  onUndo: () => void;
}) {
  return (
    <article className="tax-entry tax-entry--undo">
      <TaxUndoContent expiresAt={expiresAt} onUndo={onUndo} />
    </article>
  );
}
