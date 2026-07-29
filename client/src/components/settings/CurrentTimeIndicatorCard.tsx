import { useAtom } from 'jotai';
import { ColorPalettePicker } from '../ColorPalettePicker';
import { nowTimeLinePrefsAtom } from '../../atoms/nowTimeIndicator';
import {
  SETTINGS_CARD_ICONS,
  SettingsCardHeader,
} from './SettingsCardHeader';

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function CurrentTimeIndicatorCard() {
  const [prefs, setPrefs] = useAtom(nowTimeLinePrefsAtom);

  return (
    <section className="settings-card">
      <SettingsCardHeader icon={SETTINGS_CARD_ICONS.workingHours} title="Текущее время" />
      <p className="settings-card__desc">
        Показывает линию текущего времени в недельном расписании.
      </p>

      <div className="settings-card__seg">
        <div className="seg settings-presets">
          <button
            type="button"
            className={'seg__btn' + (prefs.enabled ? ' is-active' : '')}
            onClick={() => setPrefs({ ...prefs, enabled: true })}
          >
            Включено
          </button>
          <button
            type="button"
            className={'seg__btn' + (!prefs.enabled ? ' is-active' : '')}
            onClick={() => setPrefs({ ...prefs, enabled: false })}
          >
            Выключено
          </button>
        </div>
      </div>

      <details className="drawer-spoiler settings-now-line__spoiler">
        <summary className="drawer-spoiler__summary">
          <span className="drawer-spoiler__title">Внешний вид линии</span>
        </summary>
        <div className="drawer-spoiler__body">
          <label className="field">
            <span className="field__label">
              Непрозрачность
              <span className="settings-now-line__opacity-val">
                {Math.round(prefs.opacity * 100)}%
              </span>
            </span>
            <input
              className="settings-now-line__opacity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(prefs.opacity * 100)}
              onChange={(e) => {
                const value = Number(e.target.value);
                setPrefs({
                  ...prefs,
                  opacity: clamp(value, 0, 100) / 100,
                });
              }}
              disabled={!prefs.enabled}
              aria-label="Непрозрачность линии"
            />
          </label>

          <label className="field">
            <span className="field__label">Толщина (px) для не-текущих дней</span>
            <input
              className="field__control"
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={prefs.thicknessPx}
              onChange={(e) => {
                const value = Number(e.target.value);
                setPrefs({
                  ...prefs,
                  thicknessPx: clamp(value, 0.5, 10),
                });
              }}
              disabled={!prefs.enabled}
            />
          </label>

          <label className="field">
            <span className="field__label">Множитель толщины на текущий день</span>
            <input
              className="field__control"
              type="number"
              min={1}
              max={6}
              step={0.1}
              value={prefs.todayThicknessMultiplier}
              onChange={(e) => {
                const value = Number(e.target.value);
                setPrefs({
                  ...prefs,
                  todayThicknessMultiplier: clamp(value, 1, 6),
                });
              }}
              disabled={!prefs.enabled}
            />
          </label>

          <div className="field">
            <span className="field__label">Цвет</span>
            <ColorPalettePicker
              color={prefs.color}
              disabled={!prefs.enabled}
              label="Цвет линии текущего времени"
              onChange={(color) => setPrefs({ ...prefs, color })}
            />
          </div>
        </div>
      </details>
    </section>
  );
}
