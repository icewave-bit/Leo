import { useRef, useState } from 'react';
import type { PersonalEventGroup } from '../../api/types';
import { api } from '../../api/client';
import { COLOR_PRESETS } from '../../constants/colorPresets';
import { ColorPalettePicker } from '../ColorPalettePicker';
import { DrawerSpoiler } from '../DrawerSpoiler';
import { DurationMinField } from '../DurationMinField';

export function PersonalEventGroupsField({
  groups,
  disabled,
  onChange,
}: {
  groups: PersonalEventGroup[];
  disabled?: boolean;
  onChange: (groups: PersonalEventGroup[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);
  const [durationMin, setDurationMin] = useState(60);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const durationSeq = useRef(new Map<string, number>());

  const closeComposer = () => {
    setName('');
    setDurationMin(60);
    setAdding(false);
    setError(null);
  };

  const addGroup = async (rawName = name) => {
    if (creatingRef.current) return;
    const trimmed = rawName.trim();
    if (!trimmed) {
      setError('Введите название группы');
      return;
    }
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) {
      setError('Длительность: от 15 до 480 минут');
      return;
    }
    creatingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createPersonalEventGroup({
        name: trimmed,
        color,
        defaultDurationMin: durationMin,
      });
      onChange([...groups, created]);
      setName('');
      setDurationMin(60);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать группу');
    } finally {
      creatingRef.current = false;
      setSaving(false);
    }
  };

  const commitComposer = (next: EventTarget | null) => {
    if (next instanceof Node && composerRef.current?.contains(next)) return;
    if (next instanceof Element && next.closest('.color-palette__popover')) return;
    if (!name.trim()) {
      closeComposer();
      return;
    }
    void addGroup();
  };

  const updateGroup = async (id: string, patch: { name?: string; color?: string }) => {
    const updated = await api.patchPersonalEventGroup(id, patch);
    onChange(groups.map((g) => (g.id === id ? updated : g)));
  };

  const setGroupDuration = (id: string, next: number) => {
    onChange(groups.map((x) => (x.id === id ? { ...x, defaultDurationMin: next } : x)));
    if (!Number.isFinite(next) || next < 15 || next > 480) return;
    const seq = (durationSeq.current.get(id) ?? 0) + 1;
    durationSeq.current.set(id, seq);
    void api
      .patchPersonalEventGroup(id, { defaultDurationMin: next })
      .then((updated) => {
        if (durationSeq.current.get(id) !== seq) return;
        const confirmed = updated.defaultDurationMin;
        if (typeof confirmed !== 'number') return;
        onChange(
          groupsRef.current.map((x) =>
            x.id === id ? { ...x, defaultDurationMin: confirmed } : x,
          ),
        );
      })
      .catch((e: unknown) => {
        if (durationSeq.current.get(id) !== seq) return;
        setError(e instanceof Error ? e.message : 'Не удалось сохранить длительность');
      });
  };

  const removeGroup = async (id: string) => {
    const others = groups.filter((g) => g.id !== id);
    if (others.length === 0) {
      setError('Должна остаться хотя бы одна группа');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.deletePersonalEventGroup(id, others[0]!.id);
      onChange(others);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить группу');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pe-groups">
      <ul className="pe-groups__list">
        {groups.map((g) => (
          <li key={g.id} className="pe-groups__item">
            <div className="pe-groups__row">
              <ColorPalettePicker
                color={g.color}
                disabled={disabled || saving}
                label={`Цвет группы ${g.name}`}
                onChange={(next) => {
                  onChange(groups.map((x) => (x.id === g.id ? { ...x, color: next } : x)));
                  void updateGroup(g.id, { color: next });
                }}
              />
              <input
                className="field__control pe-groups__name"
                value={g.name}
                disabled={disabled || saving}
                onChange={(e) =>
                  onChange(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))
                }
                onBlur={() => {
                  const current = groups.find((x) => x.id === g.id);
                  if (!current) return;
                  const trimmed = current.name.trim();
                  if (trimmed && trimmed !== g.name) {
                    void updateGroup(g.id, { name: trimmed });
                  }
                }}
              />
              <button
                type="button"
                className="iconbtn iconbtn--dense pe-groups__del"
                disabled={disabled || saving || groups.length <= 1}
                aria-label={`Удалить группу ${g.name}`}
                onClick={() => void removeGroup(g.id)}
              >
                ✕
              </button>
            </div>
            <DrawerSpoiler
              className="pe-groups__spoiler"
              title={`Длительность · ${g.defaultDurationMin ?? 60} мин`}
            >
              <div className="pe-groups__duration">
                <DurationMinField
                  value={g.defaultDurationMin ?? 60}
                  showLabel={false}
                  disabled={disabled || saving}
                  onChange={(next) => setGroupDuration(g.id, next)}
                />
              </div>
            </DrawerSpoiler>
          </li>
        ))}
      </ul>
      {adding ? (
        <div
          className="pe-groups__item"
          ref={composerRef}
          onBlur={(e) => commitComposer(e.relatedTarget)}
          onMouseDown={(e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            if (target.closest('input, textarea, select')) return;
            if (document.activeElement === nameRef.current) e.preventDefault();
          }}
        >
          <div className="pe-groups__row pe-groups__row--add">
            <ColorPalettePicker
              color={color}
              disabled={disabled || saving}
              label="Цвет новой группы"
              onChange={setColor}
            />
            <input
              ref={nameRef}
              className="field__control pe-groups__name"
              value={name}
              placeholder="Название"
              disabled={disabled || saving}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addGroup(e.currentTarget.value);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeComposer();
                }
              }}
            />
          </div>
          <DrawerSpoiler
            className="pe-groups__spoiler"
            title={`Длительность · ${durationMin} мин`}
            defaultOpen
          >
            <div className="pe-groups__duration">
              <DurationMinField
                value={durationMin}
                showLabel={false}
                disabled={disabled || saving}
                onChange={setDurationMin}
              />
            </div>
          </DrawerSpoiler>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--ghost btn--sm pe-groups__new"
          disabled={disabled || saving}
          onClick={() => {
            setAdding(true);
            setError(null);
            window.setTimeout(() => nameRef.current?.focus(), 0);
          }}
        >
          Новая группа
        </button>
      )}

      {error ? <p className="settings-card__error">{error}</p> : null}
    </div>
  );
}
