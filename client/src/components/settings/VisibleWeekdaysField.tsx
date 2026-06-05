import { CALENDAR_WEEKDAY_FULL, CALENDAR_WEEKDAY_SHORT } from '../../utils/schedule';

export function VisibleWeekdaysField({
  hiddenWeekdays,
  disabled,
  onChange,
}: {
  hiddenWeekdays: number[];
  disabled?: boolean;
  onChange: (hidden: number[]) => void;
}) {
  const visibleCount = 7 - hiddenWeekdays.length;

  return (
    <div className="schedule-days">
      <div className="schedule-days__row" role="group" aria-label="Дни в расписании">
        {CALENDAR_WEEKDAY_SHORT.map((label, calendarDow) => {
          const visible = !hiddenWeekdays.includes(calendarDow);
          const lockVisible = visible && visibleCount <= 1;
          return (
            <button
              key={calendarDow}
              type="button"
              className={'schedule-days__btn' + (visible ? ' is-on' : ' is-off')}
              aria-pressed={visible}
              aria-label={
                visible
                  ? `${CALENDAR_WEEKDAY_FULL[calendarDow]} — показывается. Нажмите, чтобы скрыть`
                  : `${CALENDAR_WEEKDAY_FULL[calendarDow]} — скрыт. Нажмите, чтобы показать`
              }
              title={visible ? 'Скрыть из расписания' : 'Показать в расписании'}
              disabled={disabled || lockVisible}
              onClick={(e) => {
                if (visible) {
                  if (visibleCount <= 1) return;
                  onChange([...hiddenWeekdays, calendarDow].sort((a, b) => a - b));
                } else {
                  onChange(hiddenWeekdays.filter((d) => d !== calendarDow));
                }
                e.currentTarget.blur();
              }}
            >
              <span className="schedule-days__label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
