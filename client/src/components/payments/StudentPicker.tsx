import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { avatarHueStyle } from '../../utils/avatarStyle';
import type { ViewStudent } from '../../utils/schedule';
import { Icon } from '../Icon';

export interface StudentPickerProps {
  students: ViewStudent[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
}

function StudentAvatar({ student, size }: { student: ViewStudent | null; size?: 'sm' }) {
  if (!student) {
    return (
      <span className={'avatar picker-avatar' + (size ? ' avatar--sm' : '')} style={{ background: 'var(--surf-2)', color: 'var(--muted)' }}>
        <Icon d="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 13c2.2 0 4 1.6 4 4" />
      </span>
    );
  }
  return (
    <span
      className={'avatar picker-avatar' + (size ? ' avatar--sm' : '')}
      style={avatarHueStyle(student.hue)}
    >
      {student.initials}
    </span>
  );
}

export function StudentPicker({
  students,
  value,
  onChange,
  allowAll = true,
}: StudentPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = value ? (students.find((s) => s.id === value) ?? null) : null;
  const showSearch = students.length > 5;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={'picker' + (open ? ' picker--open' : '')} ref={rootRef}>
      <button
        type="button"
        className="picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <StudentAvatar student={selected} />
        <span className="picker__value">
          <span className="picker__name">{selected?.name ?? 'Все ученики'}</span>
          {selected ? (
            <span className="picker__hint">
              {selected.group ? 'Группа' : 'Индивидуально'}
            </span>
          ) : (
            <span className="picker__hint">{students.length} уч.</span>
          )}
        </span>
        <span className="picker__chev" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="picker__panel" role="listbox" id={listId}>
          {showSearch ? (
            <div className="picker__search">
              <input
                className="field__control picker__search-input"
                type="search"
                placeholder="Поиск…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          ) : null}
          <ul className="picker__list">
            {allowAll ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  className={'picker__item' + (value === null ? ' is-active' : '')}
                  onClick={() => pick(null)}
                >
                  <StudentAvatar student={null} size="sm" />
                  <span className="picker__item-name">Все ученики</span>
                </button>
              </li>
            ) : null}
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === s.id}
                  className={'picker__item' + (value === s.id ? ' is-active' : '')}
                  onClick={() => pick(s.id)}
                >
                  <StudentAvatar student={s} size="sm" />
                  <span className="picker__item-name">{s.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="picker__empty">Ничего не найдено</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
