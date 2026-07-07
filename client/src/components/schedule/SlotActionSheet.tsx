import { useLayoutEffect, useRef, useState } from 'react';
import type { SlotAnchor } from '../../utils/schedule';

const VIEWPORT_PAD = 12;
const ANCHOR_GAP = 8;

function computeAnchoredPosition(
  anchor: SlotAnchor,
  popoverW: number,
  popoverH: number,
): { left: number; top: number } {
  let left = anchor.right + ANCHOR_GAP;
  if (left + popoverW > window.innerWidth - VIEWPORT_PAD) {
    left = anchor.left - ANCHOR_GAP - popoverW;
  }
  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - VIEWPORT_PAD - popoverW));

  let top = anchor.top + anchor.height / 2 - popoverH / 2;
  top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - VIEWPORT_PAD - popoverH));

  return { left, top };
}

interface SlotActionSheetProps {
  dayLabel: string;
  timeLabel: string;
  blocked: boolean;
  lessonDisabled: boolean;
  toggling?: boolean;
  anchored?: boolean;
  anchor?: SlotAnchor;
  onLesson: () => void;
  onPersonal: () => void;
  onToggleBlock: () => void;
  onClose: () => void;
}

export function SlotActionSheet({
  dayLabel,
  timeLabel,
  blocked,
  lessonDisabled,
  toggling = false,
  anchored = false,
  anchor,
  onLesson,
  onPersonal,
  onToggleBlock,
  onClose,
}: SlotActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchored || !anchor) {
      setPosition(null);
      return;
    }
    const el = sheetRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setPosition(computeAnchoredPosition(anchor, width, height));
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchored, anchor, blocked, toggling]);

  const sheetStyle =
    anchored && position
      ? ({ left: position.left, top: position.top } as React.CSSProperties)
      : undefined;

  return (
    <>
      <div
        className={'scrim' + (anchored ? ' scrim--light' : '')}
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={sheetRef}
        className={'slot-sheet' + (anchored ? ' slot-sheet--anchored' : '')}
        style={sheetStyle}
        role="dialog"
        aria-label="Добавить в расписание"
      >
        <p className="slot-sheet__when">
          {dayLabel}, {timeLabel}
        </p>
        {blocked ? (
          <p className="slot-sheet__hint">Слот заблокирован для уроков</p>
        ) : null}
        <div className="slot-sheet__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={lessonDisabled}
            onClick={onLesson}
          >
            Урок
          </button>
          <button type="button" className="btn btn--ghost" onClick={onPersonal}>
            Личное событие
          </button>
        </div>
        <button
          type="button"
          className={'btn btn--ghost slot-sheet__toggle' + (blocked ? ' is-blocked' : '')}
          disabled={toggling}
          onClick={onToggleBlock}
        >
          {toggling ? '…' : blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
        <button type="button" className="slot-sheet__cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </>
  );
}
