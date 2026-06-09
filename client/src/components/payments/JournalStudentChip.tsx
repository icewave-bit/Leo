import type { ViewStudent } from '../../utils/schedule';

export function JournalStudentChip({
  studentId,
  chargedForStudentId,
  name,
  students,
}: {
  studentId: string;
  chargedForStudentId?: string | null;
  name: string;
  students: Map<string, ViewStudent>;
}) {
  const isFamilyCharge =
    chargedForStudentId != null && chargedForStudentId !== studentId;
  const chargedFor = chargedForStudentId
    ? students.get(chargedForStudentId)
    : undefined;
  const payer = students.get(studentId);
  const primaryName = name;
  const st = payer;

  if (!st) {
    return (
      <span className="pay-entry__student-text">
        <span className="pay-entry__student-name">{primaryName}</span>
        {isFamilyCharge && chargedFor ? (
          <span className="pay-entry__student-wallet">за урок {chargedFor.name}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="pay-entry__student">
      <span
        className="avatar avatar--sm"
        style={{ background: `oklch(0.62 0.13 ${st.hue})` }}
      >
        {st.initials}
      </span>
      <span className="pay-entry__student-text">
        <span className="pay-entry__student-name">{primaryName}</span>
        {isFamilyCharge && chargedFor ? (
          <span className="pay-entry__student-wallet">за урок {chargedFor.name}</span>
        ) : null}
      </span>
    </span>
  );
}
