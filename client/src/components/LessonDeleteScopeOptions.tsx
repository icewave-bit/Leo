export type LessonDeleteScope = 'lesson' | 'series';

export function LessonDeleteScopeOptions({
  scope,
  onScopeChange,
}: {
  scope: LessonDeleteScope;
  onScopeChange: (scope: LessonDeleteScope) => void;
}) {
  return (
    <div className="confirm__balance">
      <label className="confirm__balance-opt">
        <input
          type="radio"
          name="lesson-delete-scope"
          checked={scope === 'lesson'}
          onChange={() => onScopeChange('lesson')}
        />
        <span>Удалить только этот урок</span>
      </label>
      <label className="confirm__balance-opt confirm__balance-opt--spaced">
        <input
          type="radio"
          name="lesson-delete-scope"
          checked={scope === 'series'}
          onChange={() => onScopeChange('series')}
        />
        <span>Удалить повторяющуюся серию</span>
      </label>
    </div>
  );
}
