import { useRef, useState } from 'react';

const DEFAULT_DURATION_PRESETS = [30, 60];

export const EVENT_DURATION_PRESETS = [30, 45, 60, 120];

export function DurationMinField({
  value,
  onChange,
  disabled,
  label = 'Длительность',
  showLabel = true,
  presets = DEFAULT_DURATION_PRESETS,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  showLabel?: boolean;
  presets?: readonly number[];
}) {
  const isPreset = (next: number) => presets.includes(next);
  const [customMode, setCustomMode] = useState(() => !isPreset(value));
  const [seenValue, setSeenValue] = useState(value);
  const emittedRef = useRef(false);

  if (value !== seenValue) {
    setSeenValue(value);
    if (emittedRef.current) {
      emittedRef.current = false;
      if (!isPreset(value)) setCustomMode(true);
    } else {
      setCustomMode(!isPreset(value));
    }
  }

  const showCustom = customMode || !isPreset(value);

  const emit = (next: number) => {
    if (next !== value) emittedRef.current = true;
    onChange(next);
  };

  return (
    <div className="field duration-field">
      {showLabel ? <span className="field__label">{label}</span> : null}
      <div className="seg" role="group" aria-label={label}>
        {presets.map((min) => (
          <button
            key={min}
            type="button"
            className={'seg__btn' + (!showCustom && value === min ? ' is-active' : '')}
            disabled={disabled}
            onClick={() => {
              setCustomMode(false);
              emit(min);
            }}
          >
            {min} м
          </button>
        ))}
        <button
          type="button"
          className={'seg__btn' + (showCustom ? ' is-active' : '')}
          disabled={disabled}
          onClick={() => setCustomMode(true)}
        >
          Другое
        </button>
      </div>
      {showCustom ? (
        <input
          className="field__control"
          type="number"
          min={15}
          max={480}
          step={1}
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => emit(Number(e.target.value))}
        />
      ) : null}
    </div>
  );
}
