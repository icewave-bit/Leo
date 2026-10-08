import { useEffect, useId, useMemo, useState, type Ref } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { api } from '../api/client';
import { personalEventTitlesAtom } from '../atoms/schedule';
import { matchingPersonalEventTitles } from '../utils/personalEventTitles';

export function PersonalEventTitleField({
  groupId,
  value,
  onChange,
  autoFocus = false,
  placeholder,
  inputRef,
}: {
  groupId: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const titlesByGroup = useAtomValue(personalEventTitlesAtom);
  const titles = titlesByGroup[groupId] ?? [];
  const setTitles = useSetAtom(personalEventTitlesAtom);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputId = useId();
  const matches = useMemo(() => matchingPersonalEventTitles(titles, value), [titles, value]);
  const visible = open && matches.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    api
      .personalEventTitles(groupId)
      .then((list) => {
        if (cancelled) return;
        setTitles((current) => ({ ...current, [groupId]: list }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [groupId, setTitles]);

  const pick = (title: string) => {
    onChange(title);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        Название
      </label>
      <input
        id={inputId}
        ref={inputRef}
        className="field__control"
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={
          visible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (value.trim()) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((index) => (index + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
          } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            pick(matches[activeIndex]!);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder={placeholder}
        required
        maxLength={80}
        autoFocus={autoFocus}
      />
      {visible ? (
        <ul id={listId} className="pe-title-suggest" role="listbox" aria-label="Прошлые названия">
          {matches.map((title, index) => (
            <li key={title} role="presentation">
              <button
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`pe-title-suggest__item${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(title)}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
