import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BalanceKind, Lesson } from '../../api/types';
import { api } from '../../api/client';
import { tutorAtom } from '../../atoms/auth';
import { useAtomValue } from 'jotai';
import { STATUS_LABELS } from '../../constants/status';
import { useStudentActions } from '../../hooks/useStudentActions';
import { useStudent } from '../../hooks/useStudentMap';
import { fmtLessonWhen, studentLessonRange } from '../../utils/format';
import { toUiStatus } from '../../utils/schedule';
import { BalanceKindSeg } from '../BalanceKindSeg';
import { ConfirmDialog } from '../ConfirmDialog';
import { Wallet } from '../Wallet';
import type { ViewStudent } from '../../utils/schedule';

const CURRENCIES = ['EUR', 'RUB', 'USD'] as const;

export interface StudentFormValues {
  name: string;
  initials: string;
  hue: number;
  tz: string;
  meetUrl: string;
  rate: string;
  currency: string;
  note: string;
  isGroup: boolean;
  membersText: string;
  balanceKind: BalanceKind;
  prepaid: string;
  debt: string;
}

function emptyForm(tz: string): StudentFormValues {
  return {
    name: '',
    initials: '',
    hue: 250,
    tz,
    meetUrl: '',
    rate: '',
    currency: 'EUR',
    note: '',
    isGroup: false,
    membersText: '',
    balanceKind: 'money',
    prepaid: '0',
    debt: '0',
  };
}

function fromStudent(s: ViewStudent): StudentFormValues {
  return {
    name: s.name,
    initials: s.initials,
    hue: s.hue,
    tz: s.tz,
    meetUrl: s.meet ?? '',
    rate: s.rate != null ? String(s.rate) : '',
    currency: s.currency,
    note: s.note ?? '',
    isGroup: s.group,
    membersText: s.members.join('\n'),
    balanceKind: s.balanceKind,
    prepaid: String(s.prepaid),
    debt: String(s.debt),
  };
}

function balanceAmount(form: StudentFormValues, field: 'prepaid' | 'debt'): number {
  const raw = Math.max(0, Number(form[field]) || 0);
  return form.balanceKind === 'lessons' ? Math.round(raw) : raw;
}

function toPayload(form: StudentFormValues) {
  const members = form.membersText
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean);
  const rate = form.rate.trim() ? Number(form.rate) : null;
  const meetUrl = form.meetUrl.trim() || null;
  return {
    name: form.name.trim(),
    initials: form.initials.trim() || undefined,
    hue: form.hue,
    tz: form.tz.trim(),
    meetUrl,
    rate: rate != null && !Number.isNaN(rate) ? rate : null,
    currency: form.currency,
    note: form.note.trim() || null,
    isGroup: form.isGroup,
    members: form.isGroup ? members : [],
    balanceKind: form.balanceKind,
    prepaid: balanceAmount(form, 'prepaid'),
    debt: balanceAmount(form, 'debt'),
  };
}

interface StudentDrawerProps {
  mode: 'create' | 'edit';
  studentId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function StudentDrawer({ mode, studentId, onClose, onCreated }: StudentDrawerProps) {
  const tutor = useAtomValue(tutorAtom);
  const existing = useStudent(studentId);
  const { createStudent, updateStudent, deleteStudent } = useStudentActions();
  const navigate = useNavigate();
  const defaultTz = tutor?.timezone ?? 'UTC';

  const [form, setForm] = useState<StudentFormValues>(() =>
    mode === 'edit' && existing ? fromStudent(existing) : emptyForm(defaultTz),
  );
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && existing) setForm(fromStudent(existing));
  }, [mode, existing]);

  useEffect(() => {
    if (mode !== 'edit' || !studentId) return;
    let cancelled = false;
    setLessonsLoading(true);
    const { from, to } = studentLessonRange();
    api
      .lessons(from, to, studentId)
      .then((rows) => {
        if (!cancelled) setLessons(rows);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      })
      .finally(() => {
        if (!cancelled) setLessonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, studentId]);

  const previewStudent = useMemo((): ViewStudent | null => {
    const base = existing ?? {
      id: '',
      name: form.name || 'Новый',
      initials: form.initials || '??',
      hue: form.hue,
      tz: form.tz,
      rate: form.rate ? Number(form.rate) : null,
      currency: form.currency,
      meet: form.meetUrl || null,
      note: form.note || null,
      group: form.isGroup,
      members: [],
      balanceKind: form.balanceKind,
      prepaid: balanceAmount(form, 'prepaid'),
      debt: balanceAmount(form, 'debt'),
    };
    return {
      ...base,
      name: form.name || base.name,
      initials: form.initials || base.initials,
      hue: form.hue,
      balanceKind: form.balanceKind,
      prepaid: balanceAmount(form, 'prepaid'),
      debt: balanceAmount(form, 'debt'),
      currency: form.currency,
    };
  }, [existing, form]);

  const set = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Укажите имя ученика');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      if (mode === 'create') {
        const id = await createStudent(payload);
        if (onCreated) onCreated(id);
        else onClose();
      } else if (studentId) {
        await updateStudent(studentId, payload);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!studentId) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStudent(studentId);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
      setDeleting(false);
    }
  };

  const openSchedule = () => {
    if (!studentId) return;
    navigate('/schedule', { state: { addLessonForStudent: studentId } });
  };

  const upcoming = lessons.filter((l) => new Date(l.startUtc) >= new Date() && l.status !== 'cancelled');
  const past = lessons
    .filter((l) => new Date(l.startUtc) < new Date() || l.status === 'cancelled')
    .reverse();

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="Удалить ученика?"
        description={`${previewStudent?.name ?? 'Ученик'} и связанные данные будут удалены. Удаление невозможно, если у ученика есть уроки.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      />
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer drawer--wide" role="dialog" aria-label={mode === 'create' ? 'Новый ученик' : 'Ученик'}>
        <header className="drawer__head">
          {previewStudent ? (
            <span
              className="avatar avatar--lg"
              style={{ background: `oklch(0.62 0.13 ${previewStudent.hue})` }}
            >
              {previewStudent.initials.slice(0, 2)}
            </span>
          ) : null}
          <div className="drawer__head-txt">
            <h3>{mode === 'create' ? 'Новый ученик' : previewStudent?.name}</h3>
            <span className="drawer__sub">
              {form.isGroup ? 'Группа' : 'Индивидуально'} · {form.tz || defaultTz}
            </span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <form
          className="drawer__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <section className="drawer__section">
            <h4 className="drawer__section-title">Профиль</h4>
            <label className="field">
              <span className="field__label">Имя</span>
              <input
                className="field__control"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span className="field__label">Инициалы (необязательно)</span>
              <input
                className="field__control"
                value={form.initials}
                onChange={(e) => set('initials', e.target.value)}
                maxLength={4}
                placeholder="Авто из имени"
              />
            </label>
            <label className="field field--row">
              <input
                type="checkbox"
                checked={form.isGroup}
                onChange={(e) => set('isGroup', e.target.checked)}
              />
              <span className="field__label">Групповой ученик</span>
            </label>
            {form.isGroup ? (
              <label className="field">
                <span className="field__label">Участники (по одному на строку)</span>
                <textarea
                  className="field__control field__control--area"
                  value={form.membersText}
                  rows={3}
                  onChange={(e) => set('membersText', e.target.value)}
                />
              </label>
            ) : null}
            <label className="field">
              <span className="field__label">Цвет (оттенок)</span>
              <input
                className="field__control field__control--hue"
                type="range"
                min={0}
                max={360}
                value={form.hue}
                onChange={(e) => set('hue', Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="field__label">Часовой пояс</span>
              <input
                className="field__control"
                value={form.tz}
                onChange={(e) => set('tz', e.target.value)}
                placeholder="Europe/Moscow"
              />
            </label>
            <label className="field">
              <span className="field__label">Ссылка Meet</span>
              <input
                className="field__control"
                type="url"
                value={form.meetUrl}
                onChange={(e) => set('meetUrl', e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </label>
            <div className="field field--inline">
              <label className="field">
                <span className="field__label">Ставка за ак. час</span>
                <input
                  className="field__control"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.rate}
                  onChange={(e) => set('rate', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Валюта</span>
                <select
                  className="field__control"
                  value={form.currency}
                  onChange={(e) => set('currency', e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field__label">Заметка</span>
              <textarea
                className="field__control field__control--area"
                value={form.note}
                rows={2}
                onChange={(e) => set('note', e.target.value)}
              />
            </label>
          </section>

          <section className="drawer__section">
            <h4 className="drawer__section-title">Баланс</h4>
            <BalanceKindSeg
              value={form.balanceKind}
              onChange={(balanceKind) => set('balanceKind', balanceKind)}
            />
            <div className="field field--inline">
              <label className="field">
                <span className="field__label">
                  {form.balanceKind === 'lessons' ? 'Оплачено уроков' : 'Предоплата'}
                </span>
                <input
                  className="field__control"
                  type="number"
                  min={0}
                  step={form.balanceKind === 'lessons' ? 1 : 0.01}
                  value={form.prepaid}
                  onChange={(e) => set('prepaid', e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {form.balanceKind === 'lessons' ? 'Долг (уроков)' : 'Долг'}
                </span>
                <input
                  className="field__control"
                  type="number"
                  min={0}
                  step={form.balanceKind === 'lessons' ? 1 : 0.01}
                  value={form.debt}
                  onChange={(e) => set('debt', e.target.value)}
                />
              </label>
            </div>
            {previewStudent ? (
              <div className="drawer__wallet">
                <Wallet student={previewStudent} />
              </div>
            ) : null}
          </section>

          {mode === 'edit' && studentId ? (
            <section className="drawer__section">
              <div className="drawer__section-head">
                <h4 className="drawer__section-title">Расписание</h4>
                <button type="button" className="link" onClick={openSchedule}>
                  + Урок в расписании
                </button>
              </div>
              {lessonsLoading ? (
                <p className="drawer__hint">Загрузка уроков…</p>
              ) : lessons.length === 0 ? (
                <p className="drawer__hint">Нет уроков в выбранном периоде.</p>
              ) : (
                <ul className="student-lessons">
                  {upcoming.length > 0 ? (
                    <>
                      <li className="student-lessons__label">Предстоящие</li>
                      {upcoming.map((l) => (
                        <LessonRow key={l.id} lesson={l} tz={form.tz || defaultTz} />
                      ))}
                    </>
                  ) : null}
                  {past.length > 0 ? (
                    <>
                      <li className="student-lessons__label">Прошедшие</li>
                      {past.slice(0, 12).map((l) => (
                        <LessonRow key={l.id} lesson={l} tz={form.tz || defaultTz} />
                      ))}
                    </>
                  ) : null}
                </ul>
              )}
            </section>
          ) : null}

          {error ? <p className="drawer__error">{error}</p> : null}

          <div className="drawer__actions drawer__actions--spread">
            {mode === 'edit' ? (
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={() => setConfirmOpen(true)}
                disabled={saving || deleting}
              >
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="drawer__actions-end">
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving || deleting}>
                {saving ? 'Сохранение…' : mode === 'create' ? 'Добавить' : 'Сохранить'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </>
  );
}

function LessonRow({ lesson, tz }: { lesson: Lesson; tz: string }) {
  const ui = toUiStatus(lesson.status);
  const label = STATUS_LABELS[ui];

  return (
    <li className="student-lessons__item">
      <span className="student-lessons__when">{fmtLessonWhen(lesson.startUtc, tz)}</span>
      <span className="student-lessons__meta">
        <i className="dot" style={{ background: label.dot }} />
        {label.ru}
        {lesson.paid ? ' · оплачен' : ' · не оплачен'}
      </span>
    </li>
  );
}
