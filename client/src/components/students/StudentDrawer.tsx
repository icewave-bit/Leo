import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BalanceKind, Lesson } from '../../api/types';
import { api } from '../../api/client';
import { tutorAtom } from '../../atoms/auth';
import { useAtomValue, useSetAtom } from 'jotai';
import { STATUS_LABELS } from '../../constants/status';
import { useStudentActions } from '../../hooks/useStudentActions';
import { useStudent } from '../../hooks/useStudentMap';
import {
  convertBalanceNet,
  formatBalanceNetInput,
  parseBalanceNetInput,
  partsFromBalanceNet,
} from '../../utils/balanceConvert';
import { fmtLessonWhen, studentLessonRange } from '../../utils/format';
import { toUiStatus, type ViewStudent } from '../../utils/schedule';
import { balanceReplenishStudentIdAtom, studentLessonsBumpAtom } from '../../atoms/schedule';
import { BalanceKindSeg } from '../BalanceKindSeg';
import { ConfirmDialog } from '../ConfirmDialog';
import { StudentBalance } from '../StudentBalance';

const CURRENCIES = ['EUR', 'RUB', 'USD'] as const;

const LESSON_STATUS_TONE: Record<string, 'credit' | 'debt' | 'neutral'> = {
  planned: 'neutral',
  completed: 'credit',
  cancelled: 'neutral',
  'no-show': 'debt',
};

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
  balanceNet: string;
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
    balanceNet: '0',
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
    balanceNet: formatBalanceNetInput(s.prepaid, s.debt, s.balanceKind),
  };
}

function balancePartsFromForm(form: StudentFormValues) {
  const net = parseBalanceNetInput(form.balanceNet, form.balanceKind);
  return partsFromBalanceNet(net, form.balanceKind);
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
    ...balancePartsFromForm(form),
  };
}

function payloadEquals(
  a: ReturnType<typeof toPayload>,
  b: ReturnType<typeof toPayload>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const AUTOSAVE_MS = 500;

interface StudentDrawerProps {
  mode: 'create' | 'edit';
  studentId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

function DrawerPanel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'drawer-panel' + (className ? ` ${className}` : '')}>
      <header className="drawer-panel__head">
        <h2 className="drawer-panel__title">{title}</h2>
        {action}
      </header>
      <div className="drawer-panel__body">{children}</div>
    </section>
  );
}

export function StudentDrawer({ mode, studentId, onClose, onCreated }: StudentDrawerProps) {
  const tutor = useAtomValue(tutorAtom);
  const existing = useStudent(studentId);
  const { createStudent, updateStudent, deleteStudent } = useStudentActions();
  const setReplenishId = useSetAtom(balanceReplenishStudentIdAtom);
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
  const loadedStudentIdRef = useRef<string | null>(null);
  const createLockRef = useRef(false);

  useEffect(() => {
    if (mode === 'create') {
      loadedStudentIdRef.current = null;
      setForm(emptyForm(defaultTz));
      createLockRef.current = false;
      return;
    }
    if (mode === 'edit' && existing && studentId && loadedStudentIdRef.current !== studentId) {
      setForm(fromStudent(existing));
      loadedStudentIdRef.current = studentId;
    }
  }, [mode, studentId, existing, defaultTz]);

  const lessonsBump = useAtomValue(studentLessonsBumpAtom);

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
  }, [lessonsBump, mode, studentId]);

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
      ...balancePartsFromForm(form),
    };
    const rateRaw = form.rate.trim() ? Number(form.rate) : null;
    const rate =
      rateRaw != null && !Number.isNaN(rateRaw) && rateRaw > 0 ? rateRaw : base.rate;
    const initials =
      form.initials.trim() ||
      form.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() ||
      base.initials;
    return {
      ...base,
      name: form.name || base.name,
      initials,
      hue: form.hue,
      rate,
      balanceKind: form.balanceKind,
      ...balancePartsFromForm(form),
      currency: form.currency,
      group: form.isGroup,
    };
  }, [existing, form]);

  const onBalanceKindChange = (next: BalanceKind) => {
    if (next === form.balanceKind) return;
    const rateRaw = form.rate.trim() ? Number(form.rate) : null;
    const rate = rateRaw != null && !Number.isNaN(rateRaw) && rateRaw > 0 ? rateRaw : null;
    const net = parseBalanceNetInput(form.balanceNet, form.balanceKind);
    if (rate == null) {
      setForm((f) => ({ ...f, balanceKind: next }));
      return;
    }
    const newNet = convertBalanceNet(net, form.balanceKind, next, rate);
    setForm((f) => ({
      ...f,
      balanceKind: next,
      balanceNet: String(newNet),
    }));
  };

  const set = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  useEffect(() => {
    if (mode === 'create') {
      if (!form.name.trim() || createLockRef.current) return;
      const timer = window.setTimeout(() => {
        if (createLockRef.current) return;
        createLockRef.current = true;
        setSaving(true);
        setError(null);
        void createStudent(toPayload(form))
          .then((id) => {
            if (onCreated) onCreated(id);
            else onClose();
          })
          .catch((e) => {
            createLockRef.current = false;
            setError(e instanceof Error ? e.message : 'Не удалось создать');
          })
          .finally(() => setSaving(false));
      }, AUTOSAVE_MS);
      return () => window.clearTimeout(timer);
    }

    if (mode !== 'edit' || !studentId || !existing) return;
    const payload = toPayload(form);
    if (!payload.name) return;
    if (payloadEquals(payload, toPayload(fromStudent(existing)))) return;

    const timer = window.setTimeout(() => {
      setSaving(true);
      setError(null);
      void updateStudent(studentId, payload)
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Не удалось сохранить');
        })
        .finally(() => setSaving(false));
    }, AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [
    form,
    mode,
    studentId,
    existing,
    createStudent,
    updateStudent,
    onCreated,
    onClose,
  ]);

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

  const avatarInitials = previewStudent?.initials.slice(0, 2) ?? '??';

  const balancePanel = (
    <DrawerPanel
      title="Баланс"
      className="drawer-panel--balance"
      action={
        mode === 'edit' && studentId ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setReplenishId(studentId)}
          >
            Пополнить
          </button>
        ) : undefined
      }
    >
      {previewStudent ? <StudentBalance student={previewStudent} /> : null}
      <BalanceKindSeg value={form.balanceKind} onChange={onBalanceKindChange} />
      <details className="balance-manual balance-manual--panel" open={mode === 'create'}>
        <summary className="balance-manual__summary">
          {mode === 'create' ? 'Стартовый баланс' : 'Ручная настройка'}
        </summary>
        <div className="balance-manual__body">
          <p className="drawer-panel__hint">
            {mode === 'create'
              ? 'Отрицательное значение — долг.'
              : 'Положительное — предоплата, отрицательное — долг.'}
          </p>
          <label className="field">
            <span className="field__label">
              {form.balanceKind === 'lessons' ? 'Баланс, уроков' : `Баланс, ${form.currency}`}
            </span>
            <input
              className="field__control tnum"
              type="number"
              step={form.balanceKind === 'lessons' ? 1 : 0.01}
              inputMode={form.balanceKind === 'lessons' ? 'numeric' : 'decimal'}
              value={form.balanceNet}
              onChange={(e) => set('balanceNet', e.target.value)}
            />
          </label>
        </div>
      </details>
    </DrawerPanel>
  );

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
      <aside
        className="drawer drawer--student"
        role="dialog"
        aria-label={mode === 'create' ? 'Новый ученик' : 'Профиль ученика'}
      >
        <header
          className="student-drawer__hero"
          style={{ ['--student-hue' as string]: String(form.hue) }}
        >
          <span
            className="avatar avatar--lg student-drawer__avatar"
            style={{ background: `oklch(0.62 0.13 ${form.hue})` }}
          >
            {avatarInitials}
          </span>
          <div className="student-drawer__hero-main">
            <input
              className="student-drawer__name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={mode === 'create' ? 'Имя ученика' : 'Имя'}
              required
              aria-label="Имя ученика"
            />
            <div className="seg seg--student-kind" role="group" aria-label="Тип ученика">
              <button
                type="button"
                className={'seg__btn' + (!form.isGroup ? ' is-active' : '')}
                onClick={() => set('isGroup', false)}
              >
                Индивидуально
              </button>
              <button
                type="button"
                className={'seg__btn' + (form.isGroup ? ' is-active' : '')}
                onClick={() => set('isGroup', true)}
              >
                Группа
              </button>
            </div>
          </div>
          <button type="button" className="iconbtn student-drawer__close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="student-drawer__form">
          <div className="student-drawer__scroll">
            {mode === 'edit' ? balancePanel : null}

            <DrawerPanel title="Контакты и ставка">
              <div className="drawer-panel__grid drawer-panel__grid--2">
                <label className="field">
                  <span className="field__label">Инициалы</span>
                  <input
                    className="field__control"
                    value={form.initials}
                    onChange={(e) => set('initials', e.target.value)}
                    maxLength={4}
                    placeholder="Авто"
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
              </div>
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
              <div className="drawer-panel__grid drawer-panel__grid--2">
                <label className="field">
                  <span className="field__label">Ставка / ак. ч</span>
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
            </DrawerPanel>

            <DrawerPanel title="Оформление">
              <label className="field student-drawer__hue">
                <span className="field__label">Цвет аватара</span>
                <div className="student-drawer__hue-row">
                  <span
                    className="avatar avatar--sm"
                    style={{ background: `oklch(0.62 0.13 ${form.hue})` }}
                  >
                    {avatarInitials}
                  </span>
                  <input
                    className="field__control field__control--hue"
                    type="range"
                    min={0}
                    max={360}
                    value={form.hue}
                    onChange={(e) => set('hue', Number(e.target.value))}
                    aria-valuetext={`${form.hue}°`}
                  />
                </div>
              </label>
              {form.isGroup ? (
                <label className="field">
                  <span className="field__label">Участники группы</span>
                  <textarea
                    className="field__control field__control--area"
                    value={form.membersText}
                    rows={3}
                    placeholder="По одному имени на строку"
                    onChange={(e) => set('membersText', e.target.value)}
                  />
                </label>
              ) : null}
              <label className="field">
                <span className="field__label">Заметка</span>
                <textarea
                  className="field__control field__control--area"
                  value={form.note}
                  rows={3}
                  placeholder="Важное про ученика…"
                  onChange={(e) => set('note', e.target.value)}
                />
              </label>
            </DrawerPanel>

            {mode === 'create' ? balancePanel : null}

            {mode === 'edit' && studentId ? (
              <DrawerPanel
                title="Уроки"
                action={
                  <button type="button" className="link" onClick={openSchedule}>
                    + В расписании
                  </button>
                }
              >
                {lessonsLoading ? (
                  <p className="drawer-panel__hint">Загрузка…</p>
                ) : lessons.length === 0 ? (
                  <p className="drawer-panel__hint">Нет уроков в выбранном периоде.</p>
                ) : (
                  <ul className="student-drawer-lessons">
                    {upcoming.length > 0 ? (
                      <li className="student-drawer-lessons__group">
                        <span className="student-drawer-lessons__lbl">Предстоящие</span>
                        <ul>
                          {upcoming.map((l) => (
                            <LessonRow key={l.id} lesson={l} tz={form.tz || defaultTz} />
                          ))}
                        </ul>
                      </li>
                    ) : null}
                    {past.length > 0 ? (
                      <li className="student-drawer-lessons__group">
                        <span className="student-drawer-lessons__lbl">Прошедшие</span>
                        <ul>
                          {past.slice(0, 12).map((l) => (
                            <LessonRow key={l.id} lesson={l} tz={form.tz || defaultTz} />
                          ))}
                        </ul>
                      </li>
                    ) : null}
                  </ul>
                )}
              </DrawerPanel>
            ) : null}

            {error ? <p className="drawer__error student-drawer__error">{error}</p> : null}
            {saving ? (
              <p className="drawer-panel__hint student-drawer__saving">Сохранение…</p>
            ) : null}
          </div>

          {mode === 'edit' ? (
            <footer className="student-drawer__footer">
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={() => setConfirmOpen(true)}
                disabled={saving || deleting}
              >
                Удалить
              </button>
            </footer>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function LessonRow({ lesson, tz }: { lesson: Lesson; tz: string }) {
  const ui = toUiStatus(lesson.status);
  const label = STATUS_LABELS[ui];
  const tone = LESSON_STATUS_TONE[ui] ?? 'neutral';

  return (
    <li className="student-drawer-lesson">
      <div className="student-drawer-lesson__main">
        <time className="student-drawer-lesson__when">{fmtLessonWhen(lesson.startUtc, tz)}</time>
        <span className={'pay-op pay-op--' + tone}>{label.short}</span>
      </div>
      <span
        className={
          'student-drawer-lesson__pay' + (lesson.paid ? ' student-drawer-lesson__pay--ok' : '')
        }
      >
        {lesson.paid ? 'Оплачен' : 'Не оплачен'}
      </span>
    </li>
  );
}
