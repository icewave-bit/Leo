import { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import type { ActivityActor, ActivityEntityType, ActivityStatus } from '../../api/types';
import {
  activityLogActorAtom,
  activityLogCustomFromAtom,
  activityLogCustomToAtom,
  activityLogEntityAtom,
  activityLogPeriodAtom,
  activityLogQueryAtom,
  activityLogStatusAtom,
  activityLogStudentIdAtom,
} from '../../atoms/activityLog';
import { studentsAtom } from '../../atoms/schedule';
import { ACTOR_LABELS, ENTITY_LABELS } from '../../utils/activityLog';
import { DrawerSpoiler } from '../DrawerSpoiler';
import { PeriodPicker } from '../payments/PeriodPicker';
import { StudentPicker } from '../payments/StudentPicker';

const STATUS_FILTERS: { id: ActivityStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'ok', label: 'Успех' },
  { id: 'error', label: 'Ошибки' },
];

const ACTOR_FILTERS: { id: ActivityActor | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'user', label: ACTOR_LABELS.user },
  { id: 'bot', label: ACTOR_LABELS.bot },
  { id: 'system', label: ACTOR_LABELS.system },
];

const ENTITY_FILTERS: { id: ActivityEntityType | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'student', label: ENTITY_LABELS.student },
  { id: 'lesson', label: ENTITY_LABELS.lesson },
  { id: 'personal_event', label: ENTITY_LABELS.personal_event },
  { id: 'balance', label: ENTITY_LABELS.balance },
  { id: 'settings', label: ENTITY_LABELS.settings },
  { id: 'tax', label: ENTITY_LABELS.tax },
  { id: 'schedule', label: ENTITY_LABELS.schedule },
  { id: 'auth', label: ENTITY_LABELS.auth },
];

function SegFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="pay-toolbar__field">
      <span className="pay-toolbar__lbl">{label}</span>
      <div className="seg seg--tax-paid" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={'seg__btn' + (value === opt.id ? ' is-active' : '')}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActivityLogFilters({
  timezone,
  rangeLabel,
  total,
}: {
  timezone: string;
  rangeLabel: string;
  total: number;
}) {
  const students = useAtomValue(studentsAtom);
  const [status, setStatus] = useAtom(activityLogStatusAtom);
  const [actor, setActor] = useAtom(activityLogActorAtom);
  const [entity, setEntity] = useAtom(activityLogEntityAtom);
  const [studentId, setStudentId] = useAtom(activityLogStudentIdAtom);
  const [query, setQuery] = useAtom(activityLogQueryAtom);
  const [searchDraft, setSearchDraft] = useState(query);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(searchDraft), 300);
    return () => window.clearTimeout(t);
  }, [searchDraft, setQuery]);

  const extraCount = [status !== 'all', actor !== 'all', entity !== 'all'].filter(Boolean).length;

  return (
    <section className="pay-toolbar" aria-label="Фильтры журнала">
      <div className="pay-toolbar__fields">
        <div className="pay-toolbar__field pay-toolbar__field--student">
          <span className="pay-toolbar__lbl">Ученик</span>
          <StudentPicker students={students} value={studentId} onChange={setStudentId} />
        </div>
        <div className="pay-toolbar__field pay-toolbar__field--period">
          <span className="pay-toolbar__lbl">Период</span>
          <PeriodPicker
            timezone={timezone}
            atoms={{
              period: activityLogPeriodAtom,
              customFrom: activityLogCustomFromAtom,
              customTo: activityLogCustomToAtom,
            }}
          />
        </div>
      </div>

      <div className="pay-toolbar__bar">
        <p className="pay-toolbar__range">
          {rangeLabel}
          {total > 0 ? ` · ${total}` : ''}
        </p>
        <input
          className="field__control alog-toolbar__search"
          type="search"
          placeholder="Поиск"
          aria-label="Поиск по журналу"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
      </div>

      <DrawerSpoiler
        title={extraCount > 0 ? `Ещё фильтры · ${extraCount}` : 'Ещё фильтры'}
        className="alog-filters-spoiler"
        defaultOpen={extraCount > 0}
      >
        <div className="alog-filters-grid">
          <SegFilter label="Результат" value={status} options={STATUS_FILTERS} onChange={setStatus} />
          <SegFilter label="Кто" value={actor} options={ACTOR_FILTERS} onChange={setActor} />
          <label className="pay-toolbar__field alog-filters-grid__type">
            <span className="pay-toolbar__lbl">Тип</span>
            <select
              className="field__control"
              value={entity}
              onChange={(e) => setEntity(e.target.value as ActivityEntityType | 'all')}
            >
              {ENTITY_FILTERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </DrawerSpoiler>
    </section>
  );
}
