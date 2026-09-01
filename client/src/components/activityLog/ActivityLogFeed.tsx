import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { ActivityLogEntry } from '../../api/types';
import { studentsAtom } from '../../atoms/schedule';
import type { ViewStudent } from '../../utils/schedule';
import {
  actionTitle,
  ACTOR_LABELS,
  collapsedLogPreview,
  entryStudentName,
  fmtLogClock,
  groupLogsByDay,
} from '../../utils/activityLog';
import { ActivityActorIcon } from './ActivityActorIcon';
import { ActivityLogDay } from './ActivityLogDay';
import { ActivityLogDetail } from './ActivityLogDetail';

function ActivityLogRow({
  entry,
  timezone,
  students,
}: {
  entry: ActivityLogEntry;
  timezone: string;
  students: Map<string, ViewStudent>;
}) {
  const [open, setOpen] = useState(false);
  const studentName = entryStudentName(entry, students);
  const isError = entry.status === 'error';
  const preview = collapsedLogPreview(entry, timezone).join(' · ');

  return (
    <article className={'pay-entry alog-entry' + (isError ? ' alog-entry--error' : '')}>
      <button
        type="button"
        className="alog-entry__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="alog-entry__row">
          <time className="alog-entry__time" dateTime={entry.occurredAt}>
            {fmtLogClock(entry.occurredAt, timezone)}
          </time>
          {studentName ? <span className="alog-entry__student">{studentName}</span> : null}
          <span className="alog-entry__title">
            <span className={'pay-op pay-op--' + (isError ? 'debt' : 'neutral')}>
              {actionTitle(entry.summary, studentName)}
            </span>
          </span>
          {preview ? <span className="alog-entry__preview">{preview}</span> : null}
          <span className="alog-entry__actor" title={ACTOR_LABELS[entry.actor]}>
            <ActivityActorIcon actor={entry.actor} />
          </span>
        </span>
      </button>
      {open ? (
        <ActivityLogDetail entry={entry} timezone={timezone} students={students} />
      ) : null}
    </article>
  );
}

export function ActivityLogFeed({
  items,
  timezone,
}: {
  items: ActivityLogEntry[];
  timezone: string;
}) {
  const studentsList = useAtomValue(studentsAtom);
  const students = useMemo(
    () => new Map(studentsList.map((s) => [s.id, s])),
    [studentsList],
  );
  const groups = groupLogsByDay(items, timezone);

  return (
    <div className="alog-feed">
      {groups.map((group) => (
        <ActivityLogDay
          key={group.key}
          dayKey={group.key}
          label={group.label}
          count={group.items.length}
        >
          {group.items.map((entry) => (
            <ActivityLogRow
              key={entry.id}
              entry={entry}
              timezone={timezone}
              students={students}
            />
          ))}
        </ActivityLogDay>
      ))}
    </div>
  );
}
