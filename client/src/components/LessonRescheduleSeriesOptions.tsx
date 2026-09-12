export function LessonRescheduleSeriesOptions({
  moveSeries,
  onMoveSeriesChange,
}: {
  moveSeries: boolean;
  onMoveSeriesChange: (value: boolean) => void;
}) {
  return (
    <div className="confirm__balance">
      <label className="confirm__balance-opt">
        <input
          type="checkbox"
          checked={moveSeries}
          onChange={(e) => onMoveSeriesChange(e.target.checked)}
        />
        <span>Перенести все будущие уроки этого дня</span>
      </label>
      <p className="confirm__balance-hint">
        Следующие уроки в этот день недели переедут. Уроки в другие дни серии останутся.
      </p>
    </div>
  );
}
