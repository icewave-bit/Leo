import type { ViewStudent } from '../../utils/schedule';

export function JournalStudentChip({
  studentId,
  name,
  students,
}: {
  studentId: string;
  name: string;
  students: Map<string, ViewStudent>;
}) {
  const st = students.get(studentId);
  if (!st) return <span className="pay-entry__student-name">{name}</span>;
  return (
    <span className="pay-entry__student">
      <span
        className="avatar avatar--sm"
        style={{ background: `oklch(0.62 0.13 ${st.hue})` }}
      >
        {st.initials}
      </span>
      <span className="pay-entry__student-name">{name}</span>
    </span>
  );
}
