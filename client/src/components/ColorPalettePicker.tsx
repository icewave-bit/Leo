import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_PRESETS } from '../constants/colorPresets';

type PopoverPos = { top: number; left: number };

export function ColorPalettePicker({
  color,
  disabled,
  label,
  onChange,
}: {
  color: string;
  disabled?: boolean;
  label: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open || !chipRef.current) {
      setPos(null);
      return;
    }

    const place = () => {
      const chip = chipRef.current?.getBoundingClientRect();
      const pop = popoverRef.current?.getBoundingClientRect();
      if (!chip) return;

      const gap = 4;
      const width = pop?.width ?? 112;
      const height = pop?.height ?? 88;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = chip.left;
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
      if (left < 8) left = 8;

      const below = chip.bottom + gap;
      const above = chip.top - gap - height;
      const top = below + height <= vh - 8 || above < 8 ? below : above;

      setPos({ top, left });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="color-palette" ref={wrapRef}>
      <button
        ref={chipRef}
        type="button"
        className="color-palette__chip"
        style={{ background: color }}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="color-palette__popover color-palette__popover--portal"
              role="listbox"
              aria-label={label}
              style={
                pos
                  ? { top: pos.top, left: pos.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
            >
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={color === c}
                  className={'color-palette__swatch' + (color === c ? ' is-active' : '')}
                  style={{ background: c }}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                />
              ))}
              <button
                type="button"
                className="color-palette__custom"
                aria-label="Свой цвет"
                onClick={() => inputRef.current?.click()}
              >
                ···
              </button>
            </div>,
            document.body,
          )
        : null}
      <input
        ref={inputRef}
        className="color-palette__input"
        type="color"
        value={color}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(false);
        }}
      />
    </div>
  );
}
