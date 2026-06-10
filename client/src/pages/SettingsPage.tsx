import { useAtom } from 'jotai';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BalanceKind, TaxDisplayCurrency, WeekStartsOn } from '../api/types';
import { api } from '../api/client';
import { tutorAtom } from '../atoms/auth';
import { weekStartAtom } from '../atoms/schedule';
import { themeAtom } from '../atoms/theme';
import { useAppStore } from '../hooks/useAppStore';
import { loadSchedule } from '../state/loadSchedule';
import { weekRangeUtc } from '../utils/schedule';
import { BalanceKindSeg } from '../components/BalanceKindSeg';
import {
  SETTINGS_CARD_ICONS,
  SettingsCardHeader,
} from '../components/settings/SettingsCardHeader';
import { AppVersionFooter } from '../components/settings/AppVersionFooter';
import { VisibleWeekdaysField } from '../components/settings/VisibleWeekdaysField';
import { ACADEMIC_HOUR_PRESETS, academicHourHint } from '../utils/academicHour';
import { TAX_DISPLAY_OPTIONS, TAX_RATE_PRESETS } from '../utils/taxSettings';

export function SettingsPage() {
  const [tutor, setTutor] = useAtom(tutorAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [custom, setCustom] = useState(false);
  const [customMin, setCustomMin] = useState(String(tutor?.academicHourMin ?? 60));
  const [saving, setSaving] = useState(false);
  const [weekSaving, setWeekSaving] = useState(false);
  const [replenishSaving, setReplenishSaving] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxRateCustom, setTaxRateCustom] = useState(false);
  const [taxRateDraft, setTaxRateDraft] = useState(String(tutor?.taxRatePercent ?? 10));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const store = useAppStore();

  if (!tutor) return null;

  const current = tutor.academicHourMin;
  const isPreset = ACADEMIC_HOUR_PRESETS.includes(current as (typeof ACADEMIC_HOUR_PRESETS)[number]);

  const taxRate = tutor.taxRatePercent ?? 10;
  const taxRateIsPreset = TAX_RATE_PRESETS.includes(
    taxRate as (typeof TAX_RATE_PRESETS)[number],
  );

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

  const saveTaxSettings = async (patch: {
    taxRatePercent?: number;
    taxDisplayCurrency?: TaxDisplayCurrency;
  }) => {
    setTaxSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { tutor: updated } = await api.patchMe(patch);
      setTutor(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setTaxSaving(false);
    }
  };

  const saveTaxRatePercent = async (taxRatePercent: number) => {
    if (taxRatePercent < 0 || taxRatePercent > 100) {
      setError('Ставка налога: от 0 до 100%');
      return;
    }
    if (taxRatePercent === tutor.taxRatePercent) return;
    await saveTaxSettings({ taxRatePercent });
  };

  const saveHiddenWeekdays = async (hiddenWeekdays: number[]) => {
    const current = tutor.hiddenWeekdays ?? [];
    if (
      hiddenWeekdays.length === current.length &&
      hiddenWeekdays.every((d, i) => d === current[i])
    ) {
      return;
    }
    const previous = tutor.hiddenWeekdays ?? [];
    setError(null);
    setSaved(false);
    setTutor({ ...tutor, hiddenWeekdays });
    try {
      const { tutor: updated } = await api.patchMe({ hiddenWeekdays });
      setTutor(updated);
      setSaved(true);
    } catch (e) {
      setTutor({ ...tutor, hiddenWeekdays: previous });
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
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
      await loadSchedule(store.get, store.set, { anchor: weekStart, lessonsOnly: true });
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
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.theme} title="Оформление" />
            <p className="settings-card__desc">Светлая, тёмная или как в системе.</p>
            <div className="seg settings-presets">
              <button
                type="button"
                className={'seg__btn' + (theme === 'light' ? ' is-active' : '')}
                onClick={() => setTheme('light')}
              >
                Светлая
              </button>
              <button
                type="button"
                className={'seg__btn' + (theme === 'dark' ? ' is-active' : '')}
                onClick={() => setTheme('dark')}
              >
                Тёмная
              </button>
              <button
                type="button"
                className={'seg__btn' + (theme === 'auto' ? ' is-active' : '')}
                onClick={() => setTheme('auto')}
              >
                Авто
              </button>
            </div>
          </section>

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
            От этого же зависит формат дат: dd/mm/yyyy или mm/dd/yyyy.
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
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.workdays} title="Дни в расписании" />
            <p className="settings-card__desc">
              Отключите выходные или другие нерабочие дни — они исчезнут из календаря. Уроки на скрытых
              днях сохраняются; при необходимости снова включите день здесь.
            </p>
            <VisibleWeekdaysField
              hiddenWeekdays={tutor.hiddenWeekdays ?? []}
              disabled={weekSaving}
              onChange={(hidden) => void saveHiddenWeekdays(hidden)}
            />
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

          <section className="settings-card">
            <SettingsCardHeader icon={SETTINGS_CARD_ICONS.taxes} title="Налоги" />
            <p className="settings-card__desc">
              Поведение вкладки «Налоги»: ставка для расчёта суммы налога и перевод пополнений в
              белорусские рубли по курсу НБРБ на дату пополнения.
            </p>

            <p className="settings-card__hint">Ставка налога, %</p>
            <div className="seg settings-presets">
              {TAX_RATE_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={
                    'seg__btn' + (!taxRateCustom && taxRate === pct ? ' is-active' : '')
                  }
                  disabled={taxSaving || saving || weekSaving || replenishSaving}
                  onClick={() => {
                    setTaxRateCustom(false);
                    void saveTaxRatePercent(pct);
                  }}
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                className={
                  'seg__btn' + (taxRateCustom || !taxRateIsPreset ? ' is-active' : '')
                }
                disabled={taxSaving || saving || weekSaving || replenishSaving}
                onClick={() => {
                  setTaxRateCustom(true);
                  setTaxRateDraft(String(taxRate));
                }}
              >
                Другое
              </button>
            </div>

            {taxRateCustom || !taxRateIsPreset ? (
              <form
                className="settings-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTaxRatePercent(Number(taxRateDraft));
                }}
              >
                <label className="field">
                  <span className="field__label">Процент</span>
                  <input
                    className="field__control"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={taxRateDraft}
                    onChange={(e) => setTaxRateDraft(e.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={taxSaving || saving || weekSaving || replenishSaving}
                >
                  {taxSaving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </form>
            ) : null}

            <p className="settings-card__hint" style={{ marginTop: 16 }}>
              Валюта для отображения
            </p>
            <div className="seg settings-presets">
              {TAX_DISPLAY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    'seg__btn' +
                    ((tutor.taxDisplayCurrency ?? 'BYN') === opt.id ? ' is-active' : '')
                  }
                  disabled={taxSaving || saving || weekSaving || replenishSaving}
                  onClick={() => {
                    if ((tutor.taxDisplayCurrency ?? 'BYN') === opt.id) return;
                    void saveTaxSettings({ taxDisplayCurrency: opt.id });
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card settings-card--muted">
            <SettingsCardHeader
              icon={SETTINGS_CARD_ICONS.development}
              title="В разработке"
              muted
            />
            <p className="settings-card__desc">
              LeO активно развивается — здесь появятся новые настройки и возможности.
              Следите за обновлениями.
            </p>
            <p className="settings-card__badge">Скоро</p>
          </section>
        </div>
        <AppVersionFooter />
      </div>
    </div>
  );
}
