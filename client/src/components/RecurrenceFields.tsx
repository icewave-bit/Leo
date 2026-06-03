import type { RecurrenceConfig, WeekStartsOn } from '../api/types';
import {
  addDaysToDateOnly,
  dateKeyInTz,
  formatRecurrenceSummary,
  recurrenceDayLetters,
  toggleWeekday,
} from '../utils/recurrence';

interface RecurrenceFieldsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  config: RecurrenceConfig;
  onConfigChange: (config: RecurrenceConfig) => void;
  weekStartsOn: WeekStartsOn;
  timeLabel: string;
  dayLabels: readonly string[];
  timezone: string;
}

export function RecurrenceFields({
  enabled,
  onEnabledChange,
  config,
  onConfigChange,
  weekStartsOn,
  timeLabel,
  dayLabels,
  timezone,
}: RecurrenceFieldsProps) {
  const letters = recurrenceDayLetters(weekStartsOn);
  const summary = formatRecurrenceSummary(config, dayLabels, timeLabel);
  const hasEndDate = config.endDate != null;

  return (
    <div className="field field--recurrence">
      <label className="recurrence-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span className="recurrence-toggle__label">Повторять</span>
      </label>

      {enabled ? (
        <div className="recurrence-panel">
          <label className="recurrence-row">
            <span className="recurrence-row__label">Частота:</span>
            <select
              className="field__control recurrence-row__control"
              value={config.intervalWeeks === 2 ? 'biweekly' : 'weekly'}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  intervalWeeks: e.target.value === 'biweekly' ? 2 : 1,
                })
              }
            >
              <option value="weekly">Еженедельно</option>
              <option value="biweekly">Раз в две недели</option>
            </select>
          </label>

          <p className="recurrence-row recurrence-row--on">
            <span className="recurrence-row__suffix">
              {config.intervalWeeks === 2 ? 'Раз в две недели в:' : 'Каждую неделю в:'}
            </span>
          </p>

          <div className="recurrence-days" role="group" aria-label="Дни недели">
            {letters.map((letter, index) => (
              <button
                key={`${letter}-${index}`}
                type="button"
                className={
                  'recurrence-days__btn' +
                  (config.weekdays.includes(index) ? ' is-active' : '')
                }
                aria-pressed={config.weekdays.includes(index)}
                aria-label={dayLabels[index]}
                onClick={() =>
                  onConfigChange({
                    ...config,
                    weekdays: toggleWeekday(config.weekdays, index),
                  })
                }
              >
                {letter}
              </button>
            ))}
          </div>

          <div className="recurrence-end">
            <label className="recurrence-toggle recurrence-toggle--inline">
              <input
                type="checkbox"
                checked={hasEndDate}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    endDate: e.target.checked
                      ? config.endDate ?? addDaysToDateOnly(dateKeyInTz(new Date(), timezone), 28)
                      : null,
                  })
                }
              />
              <span className="recurrence-toggle__label">До даты</span>
            </label>
            {hasEndDate ? (
              <input
                className="field__control recurrence-end__date"
                type="date"
                value={config.endDate ?? ''}
                required
                onChange={(e) =>
                  onConfigChange({ ...config, endDate: e.target.value || null })
                }
              />
            ) : null}
          </div>

          <span className="field__hint">{summary}</span>
        </div>
      ) : null}
    </div>
  );
}

export function RecurrenceIcon({ title = 'Повторяющийся урок' }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      className="ev-recur"
      aria-hidden="true"
    >
      <title>{title}</title>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}
