import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BalanceKind, CreateStudentBody, Lesson, UpdateStudentBody } from '../../api/types';
import { api } from '../../api/client';
import { tutorAtom } from '../../atoms/auth';
import { useAtomValue, useSetAtom } from 'jotai';
import { STATUS_LABELS } from '../../constants/status';
import { useStudentActions } from '../../hooks/useStudentActions';
import { useStudent } from '../../hooks/useStudentMap';
import {
  billingDependents,
  billingLinkError,
  billingPayerOptions,
  findBillingPayer,
  isBillingDependent,
} from '../../utils/billingStudent';
import {
  convertBalanceNet,
  formatBalanceNetInput,
  parseBalanceNetInput,
  partsFromBalanceNet,
} from '../../utils/balanceConvert';
import {
  archivedStudentHistoryRange,
  fmtBalanceAmount,
  fmtLessonWhen,
  studentLessonRange,
} from '../../utils/format';
import {
  attachRunningBalance,
  enrichMovements,
} from '../../utils/paymentJournal';
import { avatarHueStyle } from '../../utils/avatarStyle';
import { hexFromHue, hueFromHex } from '../../utils/colorHue';
import { studentToView, toUiStatus, type ViewStudent } from '../../utils/schedule';
import { ColorPalettePicker } from '../ColorPalettePicker';
import { useAppStore } from '../../hooks/useAppStore';
import { loadSchedule } from '../../state/loadSchedule';
import type { BalanceMovement, BillingDebtBreakdown } from '../../api/types';
import { JournalEntryCard } from '../payments/JournalEntryCard';
import { balanceReplenishStudentIdAtom, studentLessonsBumpAtom, studentsAtom } from '../../atoms/schedule';
import { BalanceKindSeg } from '../BalanceKindSeg';
import { BillingFamilyDebt } from './BillingFamilyDebt';
import { BillingPayerLink } from './BillingPayerLink';
import { ConfirmDialog } from '../ConfirmDialog';
import { StudentBalance } from '../StudentBalance';

const CURRENCIES = ['EUR', 'RUB', 'USD', 'BYN'] as const;

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
  excludeFromTaxes: boolean;
  billingStudentId: string | null;
  telegramUsername: string;
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
    excludeFromTaxes: false,
    billingStudentId: null,
    telegramUsername: '',
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
    excludeFromTaxes: s.excludeFromTaxes,
    billingStudentId: s.billingStudentId,
    telegramUsername: s.telegramUsername ?? '',
  };
}

function balancePartsFromForm(form: StudentFormValues) {
  const net = parseBalanceNetInput(form.balanceNet, form.balanceKind);
  return partsFromBalanceNet(net, form.balanceKind);
}

function toPayload(
  form: StudentFormValues,
  opts?: { includeBalance?: boolean; billingDependent?: boolean },
): UpdateStudentBody {
  const members = form.membersText
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean);
  const rate = form.rate.trim() ? Number(form.rate) : null;
  const meetUrl = form.meetUrl.trim() || null;
  const telegramRaw = form.telegramUsername.trim().replace(/^@+/, '');
  const telegramUsername = telegramRaw === '' ? null : telegramRaw;
  const base: UpdateStudentBody = {
    name: form.name.trim(),
    initials: form.initials.trim() || undefined,
    hue: form.hue,
    tz: form.tz.trim(),
    meetUrl,
    rate: rate != null && !Number.isNaN(rate) ? rate : null,
    note: form.note.trim() || null,
    isGroup: form.isGroup,
    members: form.isGroup ? members : [],
    telegramUsername,
  };

  if (opts?.billingDependent) {
    if (!form.isGroup && form.billingStudentId === null) {
      return { ...base, billingStudentId: null };
    }
    return base;
  }

  const withBilling: UpdateStudentBody = {
    ...base,
    currency: form.currency,
    balanceKind: form.balanceKind,
    excludeFromTaxes: form.excludeFromTaxes,
    billingStudentId: form.isGroup ? null : form.billingStudentId,
  };

  if (opts?.includeBalance) {
    return { ...withBilling, ...balancePartsFromForm(form) };
  }
  return withBilling;
}

function payloadEquals(a: UpdateStudentBody, b: UpdateStudentBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffPayload(
  next: UpdateStudentBody,
  baseline: UpdateStudentBody,
): UpdateStudentBody | null {
  const diff: UpdateStudentBody = {};
  const keys = new Set([
    ...Object.keys(next),
    ...Object.keys(baseline),
  ]) as Set<keyof UpdateStudentBody>;
  for (const key of keys) {
    if (JSON.stringify(next[key]) !== JSON.stringify(baseline[key])) {
      diff[key] = next[key] as never;
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

function revertBillingForm(form: StudentFormValues, server: ViewStudent): StudentFormValues {
  return {
    ...form,
    billingStudentId: server.billingStudentId,
    excludeFromTaxes: server.excludeFromTaxes,
    currency: server.currency,
    balanceKind: server.balanceKind,
    balanceNet: formatBalanceNetInput(server.prepaid, server.debt, server.balanceKind),
  };
}

function clearBillingForm(form: StudentFormValues): StudentFormValues {
  return {
    ...form,
    billingStudentId: null,
    excludeFromTaxes: false,
  };
}

const AUTOSAVE_MS = 500;

interface StudentDrawerProps {
  mode?: 'create' | 'edit';
  variant?: 'active' | 'archive';
  studentId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
  onOpenStudent?: (studentId: string) => void;
  onRestored?: () => void;
  onDeleted?: () => void;
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

function DrawerSpoiler({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="drawer-spoiler">
      <summary className="drawer-spoiler__summary">
        <span className="drawer-spoiler__title">{title}</span>
      </summary>
      <div className="drawer-spoiler__body">{children}</div>
    </details>
  );
}

export function StudentDrawer({
  mode: modeProp = 'edit',
  variant = 'active',
  studentId,
  onClose,
  onCreated,
  onOpenStudent,
  onRestored,
  onDeleted,
}: StudentDrawerProps) {
  const isArchive = variant === 'archive';
  const mode = isArchive ? 'edit' : modeProp;
  const readOnly = isArchive;

  const tutor = useAtomValue(tutorAtom);
  const allStudents = useAtomValue(studentsAtom);
  const activeStudent = useStudent(isArchive ? undefined : studentId);
  const [archivedStudent, setArchivedStudent] = useState<ViewStudent | null>(null);
  const existing = isArchive ? archivedStudent : activeStudent;
  const { createStudent, updateStudent, archiveStudent, restoreStudent, deleteStudent } =
    useStudentActions();
  const setReplenishId = useSetAtom(balanceReplenishStudentIdAtom);
  const store = useAppStore();
  const defaultTz = tutor?.timezone ?? 'UTC';

  const [form, setForm] = useState<StudentFormValues>(() =>
    mode === 'edit' && existing ? fromStudent(existing) : emptyForm(defaultTz),
  );
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [movements, setMovements] = useState<BalanceMovement[]>([]);
  const [billingDebt, setBillingDebt] = useState<BillingDebtBreakdown | null>(null);
  const [billingDebtLoading, setBillingDebtLoading] = useState(false);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBalanceOpen, setManualBalanceOpen] = useState(mode === 'create');
  const loadedStudentIdRef = useRef<string | null>(null);
  const balanceManualTouchedRef = useRef(false);
  const userEditedRef = useRef(false);
  const formRef = useRef(form);
  const existingRef = useRef(existing);
  const createLockRef = useRef(false);

  formRef.current = form;
  existingRef.current = existing;

  useEffect(() => {
    if (!isArchive || !studentId) {
      setArchivedStudent(null);
      return;
    }
    let cancelled = false;
    api
      .getStudent(studentId)
      .then((s) => {
        if (!cancelled) setArchivedStudent(studentToView(s));
      })
      .catch(() => {
        if (!cancelled) setArchivedStudent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isArchive, studentId]);

  useEffect(() => {
    if (mode === 'create') {
      loadedStudentIdRef.current = null;
      balanceManualTouchedRef.current = false;
      userEditedRef.current = false;
      setManualBalanceOpen(true);
      setForm(emptyForm(defaultTz));
      createLockRef.current = false;
      return;
    }
    if (mode === 'edit' && existing && studentId && loadedStudentIdRef.current !== studentId) {
      setForm(fromStudent(existing));
      loadedStudentIdRef.current = studentId;
      balanceManualTouchedRef.current = false;
      userEditedRef.current = false;
      setManualBalanceOpen(false);
    }
  }, [mode, studentId, existing, defaultTz]);

  useEffect(() => {
    if (mode !== 'edit' || !existing || balanceManualTouchedRef.current) return;
    if (isBillingDependent(existing)) return;
    const balanceNet = formatBalanceNetInput(
      existing.prepaid,
      existing.debt,
      existing.balanceKind,
    );
    setForm((f) =>
      f.balanceNet === balanceNet && f.balanceKind === existing.balanceKind
        ? f
        : { ...f, balanceNet, balanceKind: existing.balanceKind },
    );
  }, [
    mode,
    existing?.id,
    existing?.prepaid,
    existing?.debt,
    existing?.balanceKind,
  ]);

  const lessonsBump = useAtomValue(studentLessonsBumpAtom);

  useEffect(() => {
    if (mode !== 'edit' || !studentId) return;
    let cancelled = false;
    setLessonsLoading(true);
    const { from, to } = isArchive ? archivedStudentHistoryRange() : studentLessonRange();
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
  }, [isArchive, lessonsBump, mode, studentId]);

  useEffect(() => {
    if (!isArchive || !studentId || !tutor) return;
    let cancelled = false;
    setMovementsLoading(true);
    const { from, to } = archivedStudentHistoryRange();
    api
      .balanceMovements(from, to, studentId)
      .then((rows) => {
        if (!cancelled) setMovements(rows);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      })
      .finally(() => {
        if (!cancelled) setMovementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isArchive, studentId, tutor]);

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
      excludeFromTaxes: form.excludeFromTaxes,
      billingStudentId: null,
      openLessonDebt: 0,
      telegramLinked: false,
      telegramUsername: null,
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
      excludeFromTaxes: form.excludeFromTaxes,
      billingStudentId: form.isGroup ? null : form.billingStudentId,
      openLessonDebt: existing?.openLessonDebt ?? 0,
    };
  }, [existing, form]);

  /** Balance display uses saved rate until rate is persisted — avoids flicker while editing. */
  const balanceDisplayStudent = useMemo(() => {
    if (!previewStudent) return undefined;
    if (mode === 'edit' && existing) {
      return { ...previewStudent, rate: existing.rate };
    }
    return previewStudent;
  }, [previewStudent, existing, mode]);

  const billingDependent = isBillingDependent({ billingStudentId: form.billingStudentId });
  const billingPayer = billingDependent
    ? findBillingPayer(allStudents, { id: studentId ?? '', billingStudentId: form.billingStudentId })
    : previewStudent;
  const linkedDependents =
    mode === 'edit' && studentId ? billingDependents(allStudents, studentId) : [];
  const billingProfile = { currency: form.currency };
  const allPayerCandidates = billingPayerOptions(allStudents, studentId);
  const payerOptions = billingPayerOptions(allStudents, studentId, billingProfile);
  const hiddenPayerCount = allPayerCandidates.length - payerOptions.length;

  const showFamilyDebt =
    mode === 'edit' &&
    Boolean(studentId) &&
    !billingDependent &&
    linkedDependents.length > 0;

  useEffect(() => {
    if (!showFamilyDebt || !studentId) {
      setBillingDebt(null);
      return;
    }
    let cancelled = false;
    setBillingDebtLoading(true);
    api
      .studentBillingDebt(studentId)
      .then((data) => {
        if (!cancelled) setBillingDebt(data);
      })
      .catch(() => {
        if (!cancelled) setBillingDebt(null);
      })
      .finally(() => {
        if (!cancelled) setBillingDebtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showFamilyDebt, studentId, lessonsBump, existing?.prepaid, existing?.debt]);

  const handleBillingPayerChange = (nextId: string | null) => {
    userEditedRef.current = true;
    setError(null);
    if (!nextId) {
      setForm((f) => ({
        ...f,
        billingStudentId: null,
        excludeFromTaxes: existing?.excludeFromTaxes ?? false,
      }));
      return;
    }
    const payer = allStudents.find((s) => s.id === nextId);
    if (!payer) return;
    const linkError = billingLinkError(billingProfile, payer);
    if (linkError) {
      setError(linkError);
      return;
    }
    setForm((f) => ({
      ...f,
      billingStudentId: nextId,
      balanceKind: payer.balanceKind,
      balanceNet: '0',
      excludeFromTaxes: true,
    }));
  };

  const paymentRows = useMemo(() => {
    if (!previewStudent) return [];
    const map = new Map(allStudents.map((s) => [s.id, s]));
    map.set(previewStudent.id, previewStudent);
    const rows = enrichMovements(movements, map, tutor?.timezone ?? 'UTC');
    return attachRunningBalance(rows);
  }, [allStudents, movements, previewStudent, tutor?.timezone]);

  const onBalanceKindChange = (next: BalanceKind) => {
    if (readOnly || billingDependent) return;
    if (next === form.balanceKind) return;
    userEditedRef.current = true;
    const rateRaw = form.rate.trim() ? Number(form.rate) : null;
    const rate = rateRaw != null && !Number.isNaN(rateRaw) && rateRaw > 0 ? rateRaw : null;
    const net = parseBalanceNetInput(form.balanceNet, form.balanceKind);
    if (rate == null) {
      setForm((f) => ({ ...f, balanceKind: next }));
      return;
    }
    const newNet = convertBalanceNet(net, form.balanceKind, next, rate);
    balanceManualTouchedRef.current = true;
    setForm((f) => ({
      ...f,
      balanceKind: next,
      balanceNet: String(newNet),
    }));
  };

  const set = <K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) => {
    if (readOnly) return;
    userEditedRef.current = true;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const flushBalanceCorrection = useCallback(async () => {
    if (readOnly || mode !== 'edit' || !studentId || billingDependent) return;
    const current = formRef.current;
    const server = existingRef.current;
    if (!server || !balanceManualTouchedRef.current) return;

    const payload = toPayload(current, { includeBalance: true });
    const baseline = toPayload(fromStudent(server), { includeBalance: true });
    if (payloadEquals(payload, baseline)) {
      balanceManualTouchedRef.current = false;
      return;
    }

    const { balanceKind, prepaid, debt } = payload;
    if (prepaid === undefined || debt === undefined) return;

    setSaving(true);
    setError(null);
    try {
      await updateStudent(studentId, { balanceKind, prepaid, debt });
      balanceManualTouchedRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить баланс');
    } finally {
      setSaving(false);
    }
  }, [readOnly, mode, studentId, updateStudent]);

  useEffect(() => {
    if (readOnly) return;
    if (mode === 'create') {
      if (!form.name.trim() || createLockRef.current) return;
      const timer = window.setTimeout(() => {
        if (createLockRef.current) return;
        createLockRef.current = true;
        setSaving(true);
        setError(null);
        void createStudent(toPayload(form, { includeBalance: true }) as CreateStudentBody)
          .then((id) => {
            if (onCreated) onCreated(id);
            else onClose();
          })
          .catch((e) => {
            createLockRef.current = false;
            const msg = e instanceof Error ? e.message : 'Не удалось создать';
            setError(msg);
            setForm((f) => clearBillingForm(f));
          })
          .finally(() => setSaving(false));
      }, AUTOSAVE_MS);
      return () => window.clearTimeout(timer);
    }

    if (mode !== 'edit' || !studentId || !existing || !userEditedRef.current) return;
    const dependent = isBillingDependent(existing);
    const payload = toPayload(form, { includeBalance: false, billingDependent: dependent });
    if (!payload.name) return;
    const baseline = toPayload(fromStudent(existing), {
      includeBalance: false,
      billingDependent: dependent,
    });
    const patch = diffPayload(payload, baseline);
    if (!patch) {
      return;
    }

    const timer = window.setTimeout(() => {
      setError(null);
      void updateStudent(studentId, patch)
        .then(() => {
          userEditedRef.current = false;
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : 'Не удалось сохранить';
          setError(msg);
          const server = existingRef.current;
          const current = formRef.current;
          if ((current.billingStudentId ?? null) !== (server?.billingStudentId ?? null)) {
            setForm(
              server ? revertBillingForm(current, server) : clearBillingForm(current),
            );
          }
        });
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
    readOnly,
  ]);

  const onArchive = async () => {
    if (!studentId) return;
    setDeleting(true);
    setError(null);
    try {
      await archiveStudent(studentId);
      await loadSchedule(store.get, store.set);
      setConfirmOpen(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить в архив');
      setDeleting(false);
    }
  };

  const onRestore = async () => {
    if (!studentId) return;
    setDeleting(true);
    setError(null);
    try {
      await restoreStudent(studentId);
      await loadSchedule(store.get, store.set);
      onRestored?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось восстановить');
      setDeleting(false);
    }
  };

  const onDeletePermanent = async () => {
    if (!studentId) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStudent(studentId);
      setConfirmDeleteOpen(false);
      onDeleted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
      setDeleting(false);
    }
  };

  const pastLessons = lessons
    .filter((l) => new Date(l.startUtc) < new Date() || l.status === 'cancelled')
    .reverse();

  const avatarInitials = previewStudent?.initials.slice(0, 2) ?? '??';

  const balancePanel = (
    <DrawerPanel
      title="Баланс"
      className="drawer-panel--balance"
      action={
        mode === 'edit' && studentId && !readOnly ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={billingDependent}
            onClick={() => {
              if (!billingDependent) setReplenishId(studentId);
            }}
          >
            Пополнить
          </button>
        ) : undefined
      }
    >
      {billingDependent && billingPayer ? (
        <>
          <p className="billing-dependent-panel__debt tnum">
            Долг за уроки:{' '}
            <strong>
              {existing && existing.openLessonDebt > 0
                ? fmtBalanceAmount(
                    existing.openLessonDebt,
                    billingPayer.balanceKind,
                    billingPayer.currency,
                  )
                : 'нет'}
            </strong>
          </p>
          <p className="drawer-panel__hint">
            Личный баланс не ведётся — уроки списываются с общего счёта.
          </p>
        </>
      ) : (
        <>
          {balanceDisplayStudent ? <StudentBalance student={balanceDisplayStudent} /> : null}
          {!billingDependent && linkedDependents.length > 0 ? (
            <p className="drawer-panel__hint">
              Общий счёт также для:{' '}
              {linkedDependents.map((d) => d.name).join(', ')}
            </p>
          ) : null}
          {showFamilyDebt ? (
            billingDebtLoading ? (
              <p className="drawer-panel__hint">Загрузка долга…</p>
            ) : billingDebt ? (
              <BillingFamilyDebt
                breakdown={billingDebt}
                highlightStudentId={studentId}
              />
            ) : null
          ) : null}
        </>
      )}

      {(!readOnly || billingDependent) ? (
        <div className={'balance-actions--readonly' + (billingDependent ? ' is-readonly' : '')}>
          <BalanceKindSeg
            value={billingPayer?.balanceKind ?? form.balanceKind}
            disabled={readOnly || billingDependent}
            onChange={onBalanceKindChange}
          />
          <details
            className="balance-manual balance-manual--panel"
            open={manualBalanceOpen}
            onToggle={(e) => {
              if (!billingDependent) setManualBalanceOpen(e.currentTarget.open);
            }}
          >
            <summary
              className="balance-manual__summary"
              tabIndex={billingDependent ? -1 : undefined}
            >
              {mode === 'create' ? 'Стартовый баланс' : 'Корректировка'}
            </summary>
            <div className="balance-manual__body">
              {mode === 'create' ? (
                <p className="drawer-panel__hint">Отрицательное значение — долг.</p>
              ) : null}
              <label className="field">
                <span className="field__label">
                  {(billingPayer?.balanceKind ?? form.balanceKind) === 'lessons'
                    ? 'Баланс, уроков'
                    : `Баланс, ${billingPayer?.currency ?? form.currency}`}
                </span>
                <input
                  className="field__control tnum"
                  type="number"
                  step={(billingPayer?.balanceKind ?? form.balanceKind) === 'lessons' ? 1 : 0.01}
                  inputMode={
                    (billingPayer?.balanceKind ?? form.balanceKind) === 'lessons'
                      ? 'numeric'
                      : 'decimal'
                  }
                  value={form.balanceNet}
                  disabled={readOnly || billingDependent}
                  readOnly={billingDependent}
                  tabIndex={billingDependent ? -1 : undefined}
                  onChange={(e) => {
                    balanceManualTouchedRef.current = true;
                    set('balanceNet', e.target.value);
                  }}
                  onBlur={() => void flushBalanceCorrection()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </label>
            </div>
          </details>
        </div>
      ) : null}

      {billingDependent && billingPayer && onOpenStudent ? (
        <BillingPayerLink
          payerId={billingPayer.id}
          payerName={billingPayer.name}
          onOpen={onOpenStudent}
          className="drawer-panel__payer-link"
        />
      ) : null}
    </DrawerPanel>
  );

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        title={isArchive ? 'Восстановить ученика?' : 'Отправить в архив?'}
        description={
          isArchive
            ? `${previewStudent?.name ?? 'Ученик'} снова появится в списке учеников. Уроки в расписании нужно будет выставить заново.`
            : `${previewStudent?.name ?? 'Ученик'} исчезнет из расписания и списка учеников. История уроков и оплат сохранится в архиве. Запланированные уроки будут отменены.`
        }
        confirmLabel={isArchive ? 'Восстановить' : 'В архив'}
        cancelLabel="Отмена"
        variant={isArchive ? 'default' : 'danger'}
        loading={deleting}
        onConfirm={() => void (isArchive ? onRestore() : onArchive())}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Удалить навсегда?"
        description={`${previewStudent?.name ?? 'Ученик'} и вся история (уроки, оплаты, баланс) будут удалены без возможности восстановления.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        loading={deleting}
        onConfirm={() => void onDeletePermanent()}
        onCancel={() => {
          if (!deleting) setConfirmDeleteOpen(false);
        }}
      />
      <div className="scrim" onClick={onClose} role="presentation" />
      <aside
        className="drawer drawer--student"
        role="dialog"
        aria-label={
          isArchive ? 'Архивный ученик' : mode === 'create' ? 'Новый ученик' : 'Профиль ученика'
        }
      >
        <header
          className="student-drawer__hero"
          style={{ ['--student-hue' as string]: String(form.hue) }}
        >
          <span
            className="avatar avatar--lg student-drawer__avatar"
            style={avatarHueStyle(form.hue)}
          >
            {avatarInitials}
          </span>
          <div className="student-drawer__hero-main">
            <input
              className="student-drawer__name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={mode === 'create' ? 'Имя ученика' : 'Имя'}
              required={!readOnly}
              readOnly={readOnly}
              aria-label="Имя ученика"
            />
            {readOnly ? null : (
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
                  onClick={() => {
                    userEditedRef.current = true;
                    setForm((f) => ({ ...f, isGroup: true, billingStudentId: null }));
                  }}
                >
                  Группа
                </button>
              </div>
            )}
          </div>
          <button type="button" className="iconbtn student-drawer__close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="student-drawer__form">
          <fieldset className="student-drawer__scroll" disabled={readOnly}>
            {mode === 'edit' ? balancePanel : null}

            {!readOnly && !form.isGroup ? (
              <DrawerSpoiler title="Оплата">
                {linkedDependents.length > 0 ? (
                  <p className="drawer-panel__hint">
                    Нельзя привязать к чужому счёту, пока через ваш счёт платят:{' '}
                    {linkedDependents.map((d) => d.name).join(', ')}. Сначала отвяжите их.
                  </p>
                ) : null}
                <label className="field">
                  <span className="field__label">Лицевой счёт</span>
                  <select
                    className="field__control"
                    value={form.billingStudentId ?? ''}
                    disabled={linkedDependents.length > 0}
                    onChange={(e) => handleBillingPayerChange(e.target.value || null)}
                  >
                    <option value="">Свой счёт</option>
                    {payerOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                {error ? (
                  <p className="drawer__error student-drawer__error" role="alert">
                    {error}
                  </p>
                ) : null}
                {billingDependent ? (
                  <p className="drawer-panel__hint">
                    Чтобы сменить плательщика, сначала выберите «Свой счёт». Пополнение — только в
                    профиле плательщика.
                  </p>
                ) : (
                  <p className="drawer-panel__hint">
                    Ученики с чужим счётом не пополняют баланс сами — списания идут с
                    выбранного плательщика.
                  </p>
                )}
                {hiddenPayerCount > 0 ? (
                  <p className="drawer-panel__hint">
                    {hiddenPayerCount === 1
                      ? '1 плательщик скрыт'
                      : `${hiddenPayerCount} плательщиков скрыто`}
                    : другая валюта.
                  </p>
                ) : null}
              </DrawerSpoiler>
            ) : null}

            <DrawerSpoiler title="Контакты и ставка">
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
              <label className="field">
                <span className="field__label">Telegram</span>
                <input
                  className="field__control"
                  value={form.telegramUsername}
                  onChange={(e) => set('telegramUsername', e.target.value)}
                  placeholder="@username"
                  autoComplete="off"
                />
              </label>
              {existing?.telegramLinked ? (
                <>
                  <p className="drawer-panel__hint">
                    Бот привязан
                    {existing.telegramUsername ? ` как @${existing.telegramUsername}` : ''}.
                  </p>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={saving || readOnly}
                    onClick={() => {
                      if (!existing) return;
                      setSaving(true);
                      setError(null);
                      void updateStudent(existing.id, { unlinkTelegram: true })
                        .then(() => {
                          set('telegramUsername', '');
                        })
                        .catch((e: unknown) => {
                          setError(e instanceof Error ? e.message : 'Не удалось отвязать');
                        })
                        .finally(() => setSaving(false));
                    }}
                  >
                    Отвязать
                  </button>
                </>
              ) : (
                <p className="drawer-panel__hint">
                  Укажите @username ученика — после /start в боте аккаунт привяжется автоматически.
                </p>
              )}
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
                    disabled={billingDependent}
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
            </DrawerSpoiler>

            <DrawerSpoiler title="Оформление">
              <div className="field student-drawer__hue">
                <span className="field__label">Аватар</span>
                <div className="student-drawer__hue-row">
                  <span
                    className="avatar student-drawer__avatar-edit"
                    style={avatarHueStyle(form.hue)}
                  >
                    {readOnly ? (
                      avatarInitials
                    ) : (
                      <input
                        className="student-drawer__avatar-input"
                        value={form.initials}
                        onChange={(e) => set('initials', e.target.value.slice(0, 2))}
                        maxLength={2}
                        placeholder={avatarInitials}
                        aria-label="Инициалы"
                      />
                    )}
                  </span>
                  <ColorPalettePicker
                    color={hexFromHue(form.hue)}
                    label="Цвет аватара"
                    onChange={(hex) => set('hue', hueFromHex(hex))}
                  />
                </div>
              </div>
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
              <label className="student-drawer-tax-opt">
                <input
                  type="checkbox"
                  checked={form.excludeFromTaxes || billingDependent}
                  disabled={readOnly || billingDependent}
                  onChange={(e) => set('excludeFromTaxes', e.target.checked)}
                />
                <span>Не показывать во вкладке «Налоги»</span>
              </label>
            </DrawerSpoiler>

            {mode === 'create' ? balancePanel : null}

            {mode === 'edit' && studentId ? (
              <DrawerSpoiler title="История занятий">
                {lessonsLoading ? (
                  <p className="drawer-panel__hint">Загрузка…</p>
                ) : pastLessons.length === 0 ? (
                  <p className="drawer-panel__hint">Нет прошедших занятий в выбранном периоде.</p>
                ) : (
                  <ul className="student-drawer-lessons">
                    {pastLessons.slice(0, isArchive ? 80 : 12).map((l) => (
                      <LessonRow key={l.id} lesson={l} tz={form.tz || defaultTz} />
                    ))}
                  </ul>
                )}
              </DrawerSpoiler>
            ) : null}

            {isArchive && studentId ? (
              <DrawerSpoiler title="Оплаты и баланс">
                {movementsLoading ? (
                  <p className="drawer-panel__hint">Загрузка…</p>
                ) : paymentRows.length === 0 ? (
                  <p className="drawer-panel__hint">Нет операций.</p>
                ) : (
                  <ul className="student-drawer-payments">
                    {paymentRows.map((row) => (
                      <li key={row.id}>
                        <JournalEntryCard
                          row={row}
                          showStudent={false}
                          students={new Map([[previewStudent!.id, previewStudent!]])}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </DrawerSpoiler>
            ) : null}

            {error ? <p className="drawer__error student-drawer__error">{error}</p> : null}
            {saving ? (
              <p className="drawer-panel__hint student-drawer__saving">Сохранение…</p>
            ) : null}
          </fieldset>

          {mode === 'edit' ? (
            <footer className="student-drawer__footer">
              {isArchive ? (
                <>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setConfirmOpen(true)}
                    disabled={deleting}
                  >
                    Восстановить
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--danger"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                  >
                    Удалить
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--danger"
                  onClick={() => setConfirmOpen(true)}
                  disabled={saving || deleting}
                >
                  В архив
                </button>
              )}
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
