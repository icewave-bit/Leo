import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { STATUS_LABELS } from '../constants/status';
import { academicUnitsShort, lessonPrice } from '../utils/academicHour';
import { avatarHueStyle } from '../utils/avatarStyle';
import { fmtBalanceAmount, fmtMoney, fmtTime } from '../utils/format';
import { isLessonPast } from '../utils/lessonBalance';
import {
  completedPayHint,
  lessonPayToggleDisabled,
  payToggleLabel,
  plannedPayPreview,
} from '../utils/lessonPay';
import { weekDates, weekDayNames } from '../utils/schedule';
import { recurringSchedulesAtom } from '../atoms/schedule';
import { studentsAtom } from '../atoms/schedule';
import { tutorAtom } from '../atoms/auth';
import { weekStartAtom } from '../atoms/schedule';
import { useStudent } from '../hooks/useStudentMap';
import { findBillingPayer, isBillingDependent } from '../utils/billingStudent';
import type { ViewLesson, UiLessonStatus } from '../utils/schedule';
import { ConfirmDialog } from './ConfirmDialog';
import { LessonBalanceConfirmOptions } from './LessonBalanceConfirmOptions';
import {
  LessonDeleteScopeOptions,
  type LessonDeleteScope,
} from './LessonDeleteScopeOptions';
import { RecurrenceIcon } from './RecurrenceFields';
import { StudentBalance } from './StudentBalance';
import { BillingPayerLink } from './students/BillingPayerLink';
import { TypeIcon } from './schedule/LessonChrome';

interface LessonDrawerProps {
  lesson: ViewLesson;
  onClose: () => void;
  onStatus: (id: string, status: UiLessonStatus) => void;
  onPaid: (id: string, paid: boolean) => void;
  onNotes: (id: string, notes: string | null) => void;
  onDelete: (id: string, opts?: { restoreBalance?: boolean }) => Promise<void>;
  onDeleteSeries?: (scheduleId: string, fromLessonId: string) => Promise<void>;
}

export function LessonDrawer({
  lesson,
  onClose,
  onStatus,
  onPaid,
  onNotes,
  onDelete,
  onDeleteSeries,
}: LessonDrawerProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lesson.notes ?? '');
  const [deleteScope, setDeleteScope] = useState<LessonDeleteScope>('lesson');
  const [restoreBalance, setRestoreBalance] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotesDraft(lesson.notes ?? '');
  }, [lesson.id, lesson.notes]);

  const stu = useStudent(lesson.studentId);
  const students = useAtomValue(studentsAtom);
  const tutor = useAtomValue(tutorAtom);
  const weekStart = useAtomValue(weekStartAtom);
  const recurringSchedules = useAtomValue(recurringSchedulesAtom);
  const tz = tutor?.timezone ?? 'UTC';
  const dates = weekDates(weekStart, tz);
  const { full: daysFull } = weekDayNames(tutor?.weekStartsOn ?? 'monday');

  if (!stu) return null;

  const billingDependent = isBillingDependent(stu);
  const balanceStudent = findBillingPayer(students, stu) ?? stu;

  const price =
    stu.group || stu.rate == null ? null : lessonPrice(stu.rate, lesson.academicUnits);
  const meetHref = stu.meet
    ? stu.meet.startsWith('http')
      ? stu.meet
      : `https://${stu.meet}`
    : null;

  const lessonWhen = `${daysFull[lesson.day]}, ${dates[lesson.day]} · ${fmtTime(lesson.start)}–${fmtTime(lesson.start + lesson.dur)}`;
  const series = lesson.recurringScheduleId
    ? recurringSchedules.find((s) => s.id === lesson.recurringScheduleId)
    : null;
  const pastByTime = isLessonPast(lesson.startUtc, lesson.durationMin);
  const showBalanceOnDelete = pastByTime;
  const payDisabled = lessonPayToggleDisabled(lesson.status);
  const payPreview = plannedPayPreview(stu, lesson.academicUnits, balanceStudent);
  const payLabel = payToggleLabel(lesson, stu, balanceStudent);
  const payToggleOn = lesson.status === 'planned' ? (payPreview?.paid ?? false) : lesson.paid;

  const isRecurring = Boolean(lesson.recurringScheduleId && onDeleteSeries);
  const deleteSeries = isRecurring && deleteScope === 'series';

  const openDeleteConfirm = () => {
    setDeleteScope('lesson');
    setRestoreBalance(lesson.balanceCharged);
    setConfirmOpen(true);
  };

  const saveNotes = async () => {
    const trimmed = notesDraft.trim() || null;
    const current = lesson.notes?.trim() || null;
    if (trimmed === current) return;
    setSavingNotes(true);
    try {
      await onNotes(lesson.id, trimmed);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (deleteSeries && lesson.recurringScheduleId) {
        await onDeleteSeries!(lesson.recurringScheduleId, lesson.id);
      } else {
        await onDelete(
          lesson.id,
          showBalanceOnDelete ? { restoreBalance } : undefined,
        );
      }
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
      setDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title={deleteSeries ? 'Удалить серию?' : 'Удалить урок?'}
        description={
          deleteSeries
            ? `Повторяющаяся серия с ${stu.name} будет удалена.`
            : `Урок с ${stu.name} (${lessonWhen})`
        }
        confirmLabel={deleteSeries ? 'Удалить серию' : 'Удалить'}
        cancelLabel="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      >
        {isRecurring ? (
          <LessonDeleteScopeOptions scope={deleteScope} onScopeChange={setDeleteScope} />
        ) : null}
        {!deleteSeries && showBalanceOnDelete ? (
          <LessonBalanceConfirmOptions
            walletBalanceKind={balanceStudent.balanceKind}
            walletRate={balanceStudent.rate}
            lessonRate={stu.rate}
            academicUnits={lesson.academicUnits}
            currency={balanceStudent.currency}
            balanceCharged={lesson.balanceCharged}
            restoreBalance={restoreBalance}
            onRestoreBalanceChange={setRestoreBalance}
          />
        ) : null}
      </ConfirmDialog>
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Детали урока">
        <header className="drawer__head">
          <span className="avatar avatar--lg" style={avatarHueStyle(stu.hue)}>
            {stu.initials}
          </span>
          <div className="drawer__head-txt">
            <h3>{stu.name}</h3>
            <span className="drawer__sub">
              <TypeIcon type={lesson.type} />
              {lesson.type === 'group' ? 'Групповой урок' : 'Индивидуально'} · {stu.tz}
            </span>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="drawer__time">
          <div>
            <span className="drawer__k">Когда</span>
            <span className="drawer__v">
              {daysFull[lesson.day]}, {dates[lesson.day]} · {fmtTime(lesson.start)}–
              {fmtTime(lesson.start + lesson.dur)} · {academicUnitsShort(lesson.academicUnits)}
            </span>
          </div>
          {meetHref ? (
            <a className="btn btn--primary btn--sm" href={meetHref} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M15 8l5-3v14l-5-3M3 6h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z" />
              </svg>
              Join
            </a>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" disabled>
              Join
            </button>
          )}
        </div>

        {series ? (
          <div className="drawer__row drawer__row--series">
            <span className="drawer__k">Серия</span>
            <span className="drawer__series">
              <RecurrenceIcon />
              {series.active ? 'Повторяется еженедельно' : 'Серия на паузе'}
              {series.endDate ? ` · до ${series.endDate}` : ''}
            </span>
          </div>
        ) : null}

        <div className="drawer__row">
          <span className="drawer__k">Статус</span>
          <div className="seg">
            {(Object.keys(STATUS_LABELS) as UiLessonStatus[]).map((k) => (
              <button
                key={k}
                type="button"
                className={'seg__btn' + (lesson.status === k ? ' is-active' : '')}
                onClick={() => onStatus(lesson.id, k)}
              >
                {STATUS_LABELS[k].ru}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer__row drawer__row--pay">
          <div>
            <span className="drawer__k">Оплата</span>
            {price != null ? (
              <span className="drawer__price">{fmtMoney(price, stu.currency)}</span>
            ) : (
              <span className="drawer__price">по ставке группы</span>
            )}
            {lesson.status === 'completed' ? (
              <span className="drawer__pay-hint">{completedPayHint(lesson)}</span>
            ) : lesson.status === 'cancelled' || lesson.status === 'no-show' ? (
              <span className="drawer__pay-hint">
                Списать стоимость урока с баланса (штраф)
              </span>
            ) : payPreview ? (
              <span className="drawer__pay-hint">{payPreview.label}</span>
            ) : null}
          </div>
          <button
            type="button"
            className={
              'toggle' +
              (payToggleOn ? ' is-on' : '') +
              (payDisabled ? ' toggle--disabled' : '')
            }
            disabled={payDisabled}
            onClick={() => {
              if (!payDisabled) onPaid(lesson.id, !lesson.paid);
            }}
          >
            <span className="toggle__knob" />
            <span className="toggle__label">{payLabel}</span>
          </button>
        </div>

        <div className="drawer__balance">
          {billingDependent ? (
            <>
              <span className="drawer__k">Долг за уроки</span>
              <p className="drawer__balance-dependent tnum">
                {stu.openLessonDebt > 0
                  ? fmtBalanceAmount(
                      stu.openLessonDebt,
                      balanceStudent.balanceKind,
                      balanceStudent.currency,
                    )
                  : 'Нет неоплаченных уроков'}
              </p>
              <BillingPayerLink
                payerId={balanceStudent.id}
                payerName={balanceStudent.name}
                onOpen={(id) => navigate(`/students/${id}`)}
              />
            </>
          ) : (
            <>
              <span className="drawer__k">Баланс ученика</span>
              <StudentBalance student={balanceStudent} />
            </>
          )}
        </div>

        <label className="field">
          <span className="field__label">Напоминание</span>
          <textarea
            className="field__control field__control--area"
            value={notesDraft}
            rows={3}
            placeholder="Напомнить себе перед уроком…"
            disabled={savingNotes}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => void saveNotes()}
          />
        </label>

        {stu.note ? (
          <div className="drawer__note">
            <span className="drawer__k">Об ученике</span>
            <p>{stu.note}</p>
          </div>
        ) : null}

        {error ? <p className="drawer__error">{error}</p> : null}

        <div className="drawer__actions drawer__actions--spread">
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={openDeleteConfirm}
            disabled={deleting}
          >
            Удалить урок
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={deleting}>
            Закрыть
          </button>
        </div>
      </aside>
    </>
  );
}
