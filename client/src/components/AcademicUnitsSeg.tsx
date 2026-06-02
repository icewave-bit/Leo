import type { AcademicUnits } from '../api/types';
import { academicUnitsLabel } from '../utils/academicHour';

const OPTIONS: AcademicUnits[] = [1, 2];

export function AcademicUnitsSeg({
  value,
  onChange,
}: {
  value: AcademicUnits;
  onChange: (units: AcademicUnits) => void;
}) {
  return (
    <div className="seg seg--academic-units" role="group" aria-label="Длительность урока">
      {OPTIONS.map((units) => (
        <button
          key={units}
          type="button"
          className={'seg__btn' + (value === units ? ' is-active' : '')}
          onClick={() => onChange(units)}
        >
          {academicUnitsLabel(units)}
        </button>
      ))}
    </div>
  );
}
