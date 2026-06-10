import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { archivedStudentsAtom, archivedStudentsLoadingAtom } from '../atoms/archivedStudents';
import { tutorAtom } from '../atoms/auth';
import { StudentDrawer } from '../components/students/StudentDrawer';
import { useAppStore } from '../hooks/useAppStore';
import { loadArchivedStudents } from '../state/loadArchivedStudents';
import { avatarHueStyle } from '../utils/avatarStyle';
import { fmtLessonWhen } from '../utils/format';
import type { ViewStudent } from '../utils/schedule';

function ArchiveRow({
  student,
  onOpen,
}: {
  student: ViewStudent;
  onOpen: () => void;
}) {
  const tutor = useAtomValue(tutorAtom);
  const tz = tutor?.timezone ?? 'UTC';

  return (
    <li>
      <button type="button" className="archive-row" onClick={onOpen}>
        <span
          className="avatar avatar--sm"
          style={avatarHueStyle(student.hue)}
        >
          {student.initials}
        </span>
        <span className="archive-row__txt">
          <strong className="archive-row__name">{student.name}</strong>
          <span className="archive-row__meta">
            В архиве с {fmtLessonWhen(student.archivedAt ?? '', tz)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ArchivePage() {
  const archived = useAtomValue(archivedStudentsAtom);
  const loading = useAtomValue(archivedStudentsLoadingAtom);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const store = useAppStore();

  useEffect(() => {
    void loadArchivedStudents(store.get, store.set);
  }, [store]);

  const refreshList = () => void loadArchivedStudents(store.get, store.set);

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <Link to="/settings" className="archive-page__back">
            ← Настройки
          </Link>
          <h1 className="top__title">Архив</h1>
          <p className="top__sub">
            Ученики скрыты из расписания; история уроков и оплат сохранена.
          </p>
        </div>
      </header>

      <div className="archive-board">
        {loading && archived.length === 0 ? (
          <p className="archive-board__hint">Загрузка…</p>
        ) : archived.length === 0 ? (
          <p className="archive-board__hint">В архиве пока никого нет.</p>
        ) : (
          <ul className="archive-list">
            {archived.map((student) => (
              <ArchiveRow
                key={student.id}
                student={student}
                onOpen={() => setDrawerId(student.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {drawerId ? (
        <StudentDrawer
          variant="archive"
          studentId={drawerId}
          onClose={() => setDrawerId(null)}
          onRestored={refreshList}
          onDeleted={refreshList}
        />
      ) : null}
    </div>
  );
}
