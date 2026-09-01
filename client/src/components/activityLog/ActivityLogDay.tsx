import { useId, type ReactNode } from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import { useAtom } from 'jotai';
import { activityLogCollapsedDaysAtom } from '../../atoms/activityLog';

export function ActivityLogDay({
  dayKey,
  label,
  count,
  children,
}: {
  dayKey: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [collapsedDays, setCollapsedDays] = useAtom(activityLogCollapsedDaysAtom);
  const open = !collapsedDays.has(dayKey);
  const panelId = useId();

  return (
    <section className={'alog-day' + (open ? ' is-open' : '')}>
      <h2 className="alog-day__title">
        <button
          type="button"
          className="alog-day__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setCollapsedDays((prev) => {
              const next = new Set(prev);
              if (next.has(dayKey)) next.delete(dayKey);
              else next.add(dayKey);
              return next;
            });
          }}
        >
          <span className="alog-day__chevron" aria-hidden>
            <IconifyIcon
              icon={open ? 'line-md:arrow-small-up' : 'line-md:arrow-small-down'}
              width={16}
              height={16}
            />
          </span>
          <span className="alog-day__label">{label}</span>
          <span className="alog-day__count">· {count}</span>
        </button>
      </h2>
      <div
        id={panelId}
        className="alog-day__collapse"
        role="region"
        aria-label={label}
        inert={open ? undefined : true}
      >
        <div className="alog-day__collapse-inner">
          <div className="alog-day__list">{children}</div>
        </div>
      </div>
    </section>
  );
}
