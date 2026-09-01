import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { ActivityLogEntry } from '../../api/types';
import {
  actionTitle,
  ACTOR_LABELS,
  buildLogStory,
  effectsOf,
  entryStudentName,
  formatEffectSummary,
  fmtLogWhen,
  logRequestLine,
} from '../../utils/activityLog';
import type { ViewStudent } from '../../utils/schedule';
import { ActivityActorIcon } from './ActivityActorIcon';

function StoryTree({ children }: { children: ReactNode }) {
  return <ul className="alog-tree">{children}</ul>;
}

function RelatedTree({
  id,
  timezone,
  students,
}: {
  id: string;
  timezone: string;
  students: Map<string, ViewStudent>;
}) {
  const [items, setItems] = useState<ActivityLogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .activityLogRelated(id)
      .then((page) => {
        if (!cancelled) setItems(page.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!items || items.length === 0) return null;

  return (
    <section className="alog-detail__section">
      <h3>Потом</h3>
      <StoryTree>
        {items.map((item) => {
          const name = entryStudentName(item, students);
          const nested = effectsOf(item.details);
          return (
            <li key={item.id}>
              <div className="alog-tree__item">
                <time dateTime={item.occurredAt}>{fmtLogWhen(item.occurredAt, timezone)}</time>
                <span>{actionTitle(item.summary, name)}</span>
              </div>
              {nested.length > 0 ? (
                <ul className="alog-tree alog-tree--nested">
                  {nested.map((effect) => (
                    <li key={effect.type + effect.summary + (effect.startUtc ?? '')}>
                      {formatEffectSummary(effect, timezone)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </StoryTree>
    </section>
  );
}

export function ActivityLogDetail({
  entry,
  timezone,
  students,
}: {
  entry: ActivityLogEntry;
  timezone: string;
  students: Map<string, ViewStudent>;
}) {
  const story = buildLogStory(entry, timezone);
  const request = logRequestLine(entry);
  const studentName = entryStudentName(entry, students);
  const facts =
    studentName && !story.facts.some((fact) => fact.label === 'Ученик')
      ? [{ label: 'Ученик', value: studentName }, ...story.facts]
      : story.facts;

  return (
    <div className="alog-detail">
      {story.deleted ? <p className="alog-detail__banner">Запись удалена</p> : null}
      {story.error ? (
        <p className="alog-detail__error">
          {story.error.code ? `${story.error.code}: ` : ''}
          {story.error.message}
        </p>
      ) : null}

      {story.relocation ? (
        <div className="alog-move">
          <div className="alog-move__row">
            <span className="alog-move__lbl">Было</span>
            <span className="alog-move__val">{story.relocation.from}</span>
          </div>
          <div className="alog-move__row">
            <span className="alog-move__lbl">Стало</span>
            <span className="alog-move__val">{story.relocation.to}</span>
          </div>
        </div>
      ) : null}

      {facts.length > 0 ? (
        <dl className="alog-dl">
          {facts.map((fact) => (
            <div key={fact.label} className="alog-dl__row">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {story.changes.length > 0 ? (
        <section className="alog-detail__section">
          <h3>Что изменилось</h3>
          <StoryTree>
            {story.changes.map((change) => (
              <li key={change.label}>
                <div className="alog-change">
                  <span className="alog-change__lbl">{change.label}</span>
                  <span className="alog-change__vals">
                    {change.from == null ? (
                      change.to
                    ) : (
                      <>
                        <span className="alog-change__from">{change.from}</span>
                        <span className="alog-change__arrow" aria-hidden>
                          →
                        </span>
                        <span className="alog-change__to">{change.to}</span>
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </StoryTree>
        </section>
      ) : null}

      {story.effects.length > 0 ? (
        <section className="alog-detail__section">
          <h3>Сразу после этого</h3>
          <StoryTree>
            {story.effects.map((effect) => (
              <li key={effect.type + effect.summary + (effect.startUtc ?? '')}>
                {formatEffectSummary(effect, timezone)}
              </li>
            ))}
          </StoryTree>
        </section>
      ) : null}

      {entry.entityId ? (
        <RelatedTree id={entry.id} timezone={timezone} students={students} />
      ) : null}

      <p className="alog-detail__who">
        <ActivityActorIcon actor={entry.actor} />
        {fmtLogWhen(entry.occurredAt, timezone)} · Кто: {ACTOR_LABELS[entry.actor]}
      </p>
      {request ? <p className="alog-req alog-detail__req">{request}</p> : null}
    </div>
  );
}
