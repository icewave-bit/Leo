import { useState } from 'react';
import type { PersonalEventGroup } from '../../api/types';
import { api } from '../../api/client';
import { COLOR_PRESETS } from '../../constants/colorPresets';
import { ColorPalettePicker } from '../ColorPalettePicker';

export function PersonalEventGroupsField({
  groups,
  disabled,
  onChange,
}: {
  groups: PersonalEventGroup[];
  disabled?: boolean;
  onChange: (groups: PersonalEventGroup[]) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addGroup = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Введите название группы');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createPersonalEventGroup({ name: trimmed, color });
      onChange([...groups, created]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать группу');
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = async (id: string, patch: { name?: string; color?: string }) => {
    const updated = await api.patchPersonalEventGroup(id, patch);
    onChange(groups.map((g) => (g.id === id ? updated : g)));
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
          <li key={g.id} className="pe-groups__row">
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
          </li>
        ))}
        <li className="pe-groups__row pe-groups__row--add">
          <ColorPalettePicker
            color={color}
            disabled={disabled || saving}
            label="Цвет новой группы"
            onChange={setColor}
          />
          <input
            className="field__control pe-groups__name"
            value={name}
            placeholder="Новая группа"
            disabled={disabled || saving}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addGroup();
              }
            }}
          />
          <button
            type="button"
            className="iconbtn iconbtn--dense pe-groups__add"
            disabled={disabled || saving}
            aria-label="Добавить группу"
            onClick={() => void addGroup()}
          >
            +
          </button>
        </li>
      </ul>

      {error ? <p className="settings-card__error">{error}</p> : null}
    </div>
  );
}
