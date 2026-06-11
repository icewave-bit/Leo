import { useEffect, useRef, useState } from 'react';
import { commentPreview } from '../../utils/commentPreview';
import type { useTaxRowState } from './useTaxRowState';

type TaxRowState = ReturnType<typeof useTaxRowState>;

function resizeCommentArea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function TaxCommentSpoiler({
  state,
  saving,
  onBlur,
  variant = 'inline',
}: {
  state: TaxRowState;
  saving: boolean;
  onBlur: (comment: string) => void;
  variant?: 'inline' | 'table';
}) {
  const { commentDraft, setCommentDraft } = state;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const { preview, isTruncated, isEmpty } = commentPreview(commentDraft);
  const tablePreview = commentDraft.trim();

  useEffect(() => {
    if (!open) return;
    resizeCommentArea(areaRef.current);
  }, [open, commentDraft]);

  const close = () => {
    onBlur(commentDraft);
    setOpen(false);
  };

  const openEditor = () => {
    if (saving) return;
    setOpen(true);
    window.setTimeout(() => {
      const el = areaRef.current;
      if (el) {
        resizeCommentArea(el);
        el.focus();
      }
    }, 0);
  };

  return (
    <div
      className={
        'tax-comment-spoiler' +
        (open ? ' tax-comment-spoiler--open' : '') +
        (isEmpty ? ' tax-comment-spoiler--empty' : ' tax-comment-spoiler--filled')
      }
    >
      {open ? (
        <textarea
          ref={areaRef}
          className="field__control tax-comment-spoiler__area"
          value={commentDraft}
          placeholder="Комментарий к записи"
          disabled={saving}
          rows={1}
          onChange={(e) => {
            setCommentDraft(e.target.value);
            resizeCommentArea(e.target);
          }}
          onBlur={close}
        />
      ) : (
        <button
          type="button"
          className="tax-comment-spoiler__summary"
          disabled={saving}
          aria-label={isEmpty ? 'Добавить комментарий' : `Комментарий: ${commentDraft.trim()}`}
          onClick={openEditor}
        >
          <span
            className="tax-comment-spoiler__mark"
            aria-hidden="true"
            title={isEmpty ? 'Без комментария' : 'Есть комментарий'}
          />
          {isEmpty ? (
            <span className="tax-comment-spoiler__lbl">Комментарий</span>
          ) : variant === 'table' ? (
            <span
              className="tax-comment-spoiler__preview tax-comment-spoiler__preview--ellipsis"
              title={tablePreview}
            >
              {tablePreview}
            </span>
          ) : (
            <span
              className={
                'tax-comment-spoiler__preview' +
                (isTruncated ? ' tax-comment-spoiler__preview--truncated' : '')
              }
              title={tablePreview}
            >
              {preview}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
