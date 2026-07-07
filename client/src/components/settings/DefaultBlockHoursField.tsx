import {
  formatBlockWindowLabel,
  HOUR_OPTIONS,
  hourToStartMinutes,
} from '../../utils/scheduleBlocks';
import { fmtTime } from '../../utils/format';

export function DefaultBlockHoursField({
  startMinutes,
  endMinutes,
  overrideCount,
  disabled,
  onChange,
}: {
  startMinutes: number;
  endMinutes: number;
  overrideCount: number;
  disabled?: boolean;
  onChange: (patch: { startMinutes: number; endMinutes: number }) => void;
}) {
  const startHour = startMinutes / 60;
  const endHour = endMinutes / 60;
  const label = formatBlockWindowLabel({ startMinutes, endMinutes });

  return (
    <div className="schedule-blocks">
      <div className="schedule-blocks__row">
        <label className="schedule-blocks__field">
          <span className="schedule-blocks__label">С</span>
          <select
            className="field__control schedule-blocks__select"
            value={startHour}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                startMinutes: hourToStartMinutes(Number(e.target.value)),
                endMinutes,
              })
            }
          >
            {HOUR_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>
                {fmtTime(hour)}
              </option>
            ))}
          </select>
        </label>
        <label className="schedule-blocks__field">
          <span className="schedule-blocks__label">до</span>
          <select
            className="field__control schedule-blocks__select"
            value={endHour}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                startMinutes,
                endMinutes: hourToStartMinutes(Number(e.target.value)),
              })
            }
          >
            {HOUR_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>
                {fmtTime(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="schedule-blocks__summary">
        По умолчанию заблокировано: <strong>{label}</strong>
        {startHour === endHour ? (
          <span className="schedule-blocks__note"> (блокировка отключена)</span>
        ) : null}
      </p>
      <p className="settings-card__desc schedule-blocks__hint">
        Нажмите на слот в расписании, чтобы вручную заблокировать или разблокировать. Слоты с
        уроками или личными событиями остаются открытыми, пока вы сами их не заблокируете.
      </p>
      {overrideCount > 0 ? (
        <p className="schedule-blocks__count">Ручных настроек: {overrideCount}</p>
      ) : null}
    </div>
  );
}
