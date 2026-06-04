import { useAtom } from 'jotai';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BalanceKind, WeekStartsOn } from '../api/types';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { weekStartAtom } from '../atoms/schedule';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';
import { weekRangeUtc } from '../utils/schedule';
import { BalanceKindSeg } from '../components/BalanceKindSeg';
import {
  SETTINGS_CARD_ICONS,
  SettingsCardHeader,
} from '../components/settings/SettingsCardHeader';
import { ACADEMIC_HOUR_PRESETS, academicHourHint } from '../utils/academicHour';

export function SettingsPage() {
  const [tutor, setTutor] = useAtom(tutorAtom);
  const [custom, setCustom] = useState(false);
  const [customMin, setCustomMin] = useState(String(tutor?.academicHourMin ?? 60));
  const [saving, setSaving] = useState(false);
  const [weekSaving, setWeekSaving] = useState(false);
  const [replenishSaving, setReplenishSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const store = useAppStore();

  if (!tutor) return null;

  const current = tutor.academicHourMin;
  const isPreset = ACADEMIC_HOUR_PRESETS.includes(current as (typeof ACADEMIC_HOUR_PRESETS)[number]);

  const save = async (academicHourMin: number) => {
    if (academicHourMin < 15 || academicHourMin > 180) {
      setError('Длина ак. часа: от 15 до 180 минут');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { tutor: updated } = await api.patchMe({ academicHourMin });
      setTutor(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const saveDefaultReplenishBalanceKind = async (defaultReplenishBalanceKind: BalanceKind) => {
    if (defaultReplenishBalanceKind === tutor.defaultReplenishBalanceKind) return;
    setReplenishSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { tutor: updated } = await api.patchMe({ defaultReplenishBalanceKind });
      setTutor(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setReplenishSaving(false);
    }
  };

  const saveWeekStartsOn = async (weekStartsOn: WeekStartsOn) => {
    if (weekStartsOn === tutor.weekStartsOn) return;
    setWeekSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { tutor: updated } = await api.patchMe({ weekStartsOn });
      setTutor(updated);
      const anchor = store.get(weekStartAtom);
      const { weekStart } = weekRangeUtc(anchor, weekStartsOn);
      store.set(weekStartAtom, weekStart);
      await loadSchedule(store.get, store.set);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setWeekSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Настройки</h1>
        </div>
      </header>

      <div className="settings-board">
        {error ? <p className="settings-board__error">{error}</p> : null}
        {saved ? <p className="settings-board__ok">Сохранено</p> : null}

        <div className="settings-grid">
          <section className="settings-card">
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.archive} title="Архив учеников" />
          <p className="settings-card__desc">
            Ученики, отправленные в архив: история уроков и оплат сохраняется, в расписании они не
            отображаются.
          </p>
          <div className="settings-card__foot">
            <Link to="/archive" className="btn btn--ghost btn--sm">
              Открыть архив
            </Link>
          </div>
          </section>

          <section className="settings-card">
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.replenish} title="Пополнение баланса" />
          <p className="settings-card__desc">
            Какой тип баланса выбирать по умолчанию при открытии окна пополнения: уроки или деньги.
            Если у ученика другой тип, он переключится с пересчётом по ставке.
          </p>
          <div className="settings-card__seg">
            <BalanceKindSeg
              value={tutor.defaultReplenishBalanceKind ?? 'money'}
              disabled={replenishSaving}
              onChange={(kind) => void saveDefaultReplenishBalanceKind(kind)}
            />
          </div>
          </section>

          <section className="settings-card">
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.week} title="Начало недели" />
          <p className="settings-card__desc">
            Как отображается неделя в расписании: с понедельника (Европа) или с воскресенья (США).
          </p>
          <div className="seg settings-presets">
            <button
              type="button"
              className={'seg__btn' + (tutor.weekStartsOn === 'monday' ? ' is-active' : '')}
              disabled={weekSaving || replenishSaving}
              onClick={() => void saveWeekStartsOn('monday')}
            >
              Понедельник
            </button>
            <button
              type="button"
              className={'seg__btn' + (tutor.weekStartsOn === 'sunday' ? ' is-active' : '')}
              disabled={weekSaving || replenishSaving}
              onClick={() => void saveWeekStartsOn('sunday')}
            >
              Воскресенье
            </button>
          </div>
          </section>

          <section className="settings-card">
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.academic} title="Академический час" />
          <p className="settings-card__desc">
            Сколько минут длится один оплачиваемый час у вас. В расписании уроки
            выбираются как одинарный или двойной ак. час; ставка ученика — за один ак. час,
            без пересчёта по фактическим минутам.
          </p>
          <p className="settings-card__hint">{academicHourHint(current)}</p>

          <div className="seg settings-presets">
            {ACADEMIC_HOUR_PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                className={
                  'seg__btn' + (!custom && current === min ? ' is-active' : '')
                }
                disabled={saving || replenishSaving}
                onClick={() => {
                  setCustom(false);
                  void save(min);
                }}
              >
                {min} мин
              </button>
            ))}
            <button
              type="button"
              className={'seg__btn' + (custom || !isPreset ? ' is-active' : '')}
              disabled={saving || replenishSaving}
              onClick={() => {
                setCustom(true);
                setCustomMin(String(current));
              }}
            >
              Другое
            </button>
          </div>

          {custom || !isPreset ? (
            <form
              className="settings-custom"
              onSubmit={(e) => {
                e.preventDefault();
                void save(Number(customMin));
              }}
            >
              <label className="field">
                <span className="field__label">Минут в ак. часе</span>
                <input
                  className="field__control"
                  type="number"
                  min={15}
                  max={180}
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={saving || replenishSaving}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </form>
          ) : null}

          </section>

          <section className="settings-card settings-card--muted">
            <SettingsCardHeader
              icon={SETTINGS_CARD_ICONS.development}
              title="В разработке"
              muted
            />
            <p className="settings-card__desc">
              Tutor Monitor активно развивается — здесь появятся новые настройки и возможности.
              Следите за обновлениями.
            </p>
            <p className="settings-card__badge">Скоро</p>
          </section>
        </div>
      </div>
    </div>
  );
}
