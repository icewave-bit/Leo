import { useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { api } from '../../api/client';
import type { PersonalEventGroup, TelegramNotifyLeadMinutes, Tutor } from '../../api/types';
import { tutorAtom } from '../../atoms/auth';

const NOTIFY_LEAD_MINUTES: TelegramNotifyLeadMinutes[] = [5, 10, 15, 30, 60];

function isGroupChecked(groupId: string, personalGroupIds: string[]): boolean {
  if (personalGroupIds.length === 0) return true;
  return personalGroupIds.includes(groupId);
}

function togglePersonalGroupId(
  groupId: string,
  groups: PersonalEventGroup[],
  personalGroupIds: string[],
): string[] {
  const allIds = groups.map((g) => g.id);
  const allSelected = personalGroupIds.length === 0;
  const checked = isGroupChecked(groupId, personalGroupIds);

  if (checked) {
    if (allSelected) {
      return allIds.filter((id) => id !== groupId);
    }
    return personalGroupIds.filter((id) => id !== groupId);
  }

  const next = [...personalGroupIds, groupId];
  if (next.length === allIds.length) {
    return [];
  }
  return next;
}

function formatExpiry(expiresAt: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(expiresAt));
  } catch {
    return '';
  }
}

export function TelegramConnectField({
  tutor,
  groups,
}: {
  tutor: Tutor;
  groups: PersonalEventGroup[];
}) {
  const setTutor = useSetAtom(tutorAtom);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const notify = tutor.telegramNotify;

  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setCode(null);
      setExpiresAt(null);
      return;
    }
    const t = window.setTimeout(() => {
      setCode(null);
      setExpiresAt(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [expiresAt]);

  const createCode = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.createTelegramLinkCode();
      setCode(res.code);
      setExpiresAt(res.expiresAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать код');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Не удалось скопировать код');
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      const { tutor: updated } = await api.unlinkTelegram();
      setTutor(updated);
      setCode(null);
      setExpiresAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отключить');
    } finally {
      setBusy(false);
    }
  };

  const saveNotify = async (
    patch: NonNullable<Parameters<typeof api.patchMe>[0]['telegramNotify']>,
  ) => {
    setNotifySaving(true);
    setError(null);
    try {
      const { tutor: updated } = await api.patchMe({ telegramNotify: patch });
      setTutor(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setNotifySaving(false);
    }
  };

  if (tutor.telegramLinked) {
    const controlsDisabled = busy || notifySaving;
    const prefsDisabled = controlsDisabled || !notify.enabled;

    return (
      <div className="telegram-connect">
        <p className="settings-card__desc">
          Подключено
          {tutor.telegramUsername ? (
            <>
              {' '}
              как <span className="telegram-connect__nick">@{tutor.telegramUsername}</span>
            </>
          ) : null}
          . Бот сможет показывать расписание и балансы.
        </p>
        <div className="settings-card__foot">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={controlsDisabled}
            onClick={() => void unlink()}
          >
            Отключить
          </button>
        </div>

        <div className="telegram-notify">
          <h3 className="telegram-notify__title">Уведомления</h3>

          <div className="telegram-notify__row">
            <span className="telegram-notify__label">Включить уведомления</span>
            <button
              type="button"
              className={'toggle' + (notify.enabled ? ' is-on' : '')}
              disabled={controlsDisabled}
              aria-pressed={notify.enabled}
              onClick={() => void saveNotify({ enabled: !notify.enabled })}
            >
              <span className="toggle__knob" />
              <span className="toggle__label">{notify.enabled ? 'Вкл' : 'Выкл'}</span>
            </button>
          </div>

          <p className="settings-card__hint">Напоминать за</p>
          <div className={'seg settings-presets telegram-notify__lead' + (prefsDisabled ? ' is-disabled' : '')}>
            {NOTIFY_LEAD_MINUTES.map((min) => (
              <button
                key={min}
                type="button"
                className={'seg__btn' + (notify.leadMinutes === min ? ' is-active' : '')}
                disabled={prefsDisabled}
                onClick={() => {
                  if (notify.leadMinutes === min) return;
                  void saveNotify({ leadMinutes: min });
                }}
              >
                {min} мин
              </button>
            ))}
          </div>

          <div className="telegram-notify__row">
            <span className="telegram-notify__label">Без звука</span>
            <button
              type="button"
              className={'toggle' + (notify.silent ? ' is-on' : '')}
              disabled={prefsDisabled}
              aria-pressed={notify.silent}
              onClick={() => void saveNotify({ silent: !notify.silent })}
            >
              <span className="toggle__knob" />
              <span className="toggle__label">{notify.silent ? 'Да' : 'Нет'}</span>
            </button>
          </div>

          <div className={'telegram-notify__checks' + (prefsDisabled ? ' is-disabled' : '')}>
            <label className="telegram-notify__check">
              <input
                type="checkbox"
                checked={notify.lessons}
                disabled={prefsDisabled}
                onChange={(e) => void saveNotify({ lessons: e.target.checked })}
              />
              <span>Уроки</span>
            </label>
            <label className="telegram-notify__check">
              <input
                type="checkbox"
                checked={notify.personal}
                disabled={prefsDisabled}
                onChange={(e) => void saveNotify({ personal: e.target.checked })}
              />
              <span>Личное время</span>
            </label>
          </div>

          {notify.personal && groups.length > 0 ? (
            <div className={'telegram-notify__groups' + (prefsDisabled ? ' is-disabled' : '')}>
              <p className="settings-card__hint">Группы для напоминаний</p>
              {groups.map((group) => (
                <label key={group.id} className="telegram-notify__check">
                  <input
                    type="checkbox"
                    checked={isGroupChecked(group.id, notify.personalGroupIds)}
                    disabled={prefsDisabled}
                    onChange={() => {
                      const personalGroupIds = togglePersonalGroupId(
                        group.id,
                        groups,
                        notify.personalGroupIds,
                      );
                      void saveNotify({ personalGroupIds });
                    }}
                  />
                  <span>{group.name}</span>
                </label>
              ))}
              <p className="settings-card__hint">Пустой выбор — напоминания для всех групп</p>
            </div>
          ) : null}
        </div>

        {error ? <p className="settings-card__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="telegram-connect">
      <p className="settings-card__desc">
        Создайте код и отправьте его боту командой{' '}
        <code className="telegram-connect__cmd">/start КОД</code> — после этого бот привяжется к
        вашему аккаунту.
      </p>

      {code ? (
        <div className="telegram-connect__code-block">
          <p className="telegram-connect__code" aria-live="polite">
            {code}
          </p>
          {expiresAt ? (
            <p className="telegram-connect__expiry">Действует до {formatExpiry(expiresAt)}</p>
          ) : null}
          <div className="telegram-connect__actions">
            <button type="button" className="btn btn--soft btn--sm" onClick={() => void copyCode()}>
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void createCode()}
            >
              Новый код
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-card__foot">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busy}
            onClick={() => void createCode()}
          >
            {busy ? 'Создаём…' : 'Получить код'}
          </button>
        </div>
      )}
      {error ? <p className="settings-card__error">{error}</p> : null}
    </div>
  );
}
