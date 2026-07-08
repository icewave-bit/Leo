import type { PersonalEventOutline } from '../../api/types';

const OPTIONS: { id: PersonalEventOutline; label: string }[] = [
  { id: 'tab', label: 'Полоса' },
  { id: 'frame', label: 'Сплошная' },
  { id: 'dashed', label: 'Пунктир' },
];

export function PersonalEventOutlineField({
  value,
  disabled,
  onChange,
}: {
  value: PersonalEventOutline;
  disabled?: boolean;
  onChange: (outline: PersonalEventOutline) => void;
}) {
  return (
    <div className="pe-outline-row">
      <span className="pe-outline-row__label">Рамка</span>
      <div className="seg pe-outline-row__seg" role="group" aria-label="Рамка личных событий">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={'seg__btn' + (value === opt.id ? ' is-active' : '')}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
