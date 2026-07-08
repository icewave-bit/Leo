import { useEffect, useRef, useState } from 'react';
import { COLOR_PRESETS } from '../constants/colorPresets';

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="color-palette" ref={wrapRef}>
      <button
        type="button"
        className="color-palette__chip"
        style={{ background: color }}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div className="color-palette__popover" role="listbox" aria-label={label}>
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
        </div>
      ) : null}
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
