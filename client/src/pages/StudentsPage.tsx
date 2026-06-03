import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  balanceReplenishStudentIdAtom,
  selectedStudentIdAtom,
  studentDrawerModeAtom,
  studentsAtom,
} from '../atoms/schedule';
import { BalanceReplenishDialog } from '../components/students/BalanceReplenishDialog';
import { StudentCard } from '../components/students/StudentCard';
import { OrnamentalDivider } from '../components/OrnamentalDivider';
import { StudentDrawer } from '../components/students/StudentDrawer';
import { studentCountLabel } from '../utils/format';

export function StudentsPage() {
  const students = useAtomValue(studentsAtom);
  const [drawerMode, setDrawerMode] = useAtom(studentDrawerModeAtom);
  const [selectedId, setSelectedId] = useAtom(selectedStudentIdAtom);
  const [replenishId, setReplenishId] = useAtom(balanceReplenishStudentIdAtom);
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { studentId: routeId } = useParams();
  const navigate = useNavigate();

  const openId = routeId ?? searchParams.get('id') ?? selectedId;
  const replenishStudent = replenishId
    ? students.find((s) => s.id === replenishId)
    : undefined;

  useEffect(() => {
    if (routeId) {
      setSelectedId(routeId);
      setDrawerMode('edit');
    }
  }, [routeId, setSelectedId, setDrawerMode]);

  useEffect(() => {
    const qid = searchParams.get('id');
    if (qid && !routeId) {
      setSelectedId(qid);
      setDrawerMode('edit');
    }
  }, [searchParams, routeId, setSelectedId, setDrawerMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.members.some((m) => m.toLowerCase().includes(q)),
    );
  }, [students, query]);

  const closeDrawer = () => {
    setDrawerMode(null);
    setSelectedId(null);
    if (routeId) navigate('/students', { replace: true });
    else if (searchParams.has('id')) {
      searchParams.delete('id');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const openCreate = () => {
    setSelectedId(null);
    setDrawerMode('create');
    if (routeId) navigate('/students');
  };

  const openEdit = (id: string) => {
    setSelectedId(id);
    setDrawerMode('edit');
    navigate(`/students/${id}`, { replace: true });
  };

  const openReplenish = (id: string) => {
    setReplenishId(id);
  };

  const drawerOpen = drawerMode !== null;
  const showDrawer = drawerOpen && (drawerMode === 'create' || (drawerMode === 'edit' && openId));

  const countLabel =
    filtered.length === students.length
      ? studentCountLabel(students.length)
      : `${studentCountLabel(filtered.length)} из ${studentCountLabel(students.length)}`;

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Студенты</h1>
        </div>
      </header>

      <div className="students-board">
        <div className="students-page">
          <section className="students-toolbar" aria-label="Ученики">
            <div className="students-toolbar__row">
              <input
                className="students-toolbar__search"
                type="search"
                placeholder="Поиск"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Поиск"
              />
              <button
                type="button"
                className="btn btn--primary btn--sm students-toolbar__add"
                onClick={openCreate}
                aria-label="Добавить ученика"
              >
                +
              </button>
            </div>
          </section>

          <section className="students-feed" aria-label="Список учеников">
            {filtered.length === 0 ? (
              <div className="students-empty">
                <p>{students.length === 0 ? 'Пока нет учеников.' : 'Ничего не найдено.'}</p>
                {students.length === 0 ? (
                  <button type="button" className="btn btn--primary" onClick={openCreate}>
                    Добавить первого ученика
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="students-list">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <StudentCard
                      student={s}
                      onReplenish={() => openReplenish(s.id)}
                      onOpenProfile={(e) => {
                        e.stopPropagation();
                        openEdit(s.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {filtered.length > 0 ? (
            <footer className="students-page__foot">
              <OrnamentalDivider />
              <p className="students-page__count">{countLabel}</p>
            </footer>
          ) : null}
        </div>
      </div>

      {showDrawer ? (
        <StudentDrawer
          mode={drawerMode!}
          studentId={drawerMode === 'edit' ? openId ?? undefined : undefined}
          onClose={closeDrawer}
          onCreated={(id) => openEdit(id)}
        />
      ) : null}

      {replenishStudent ? (
        <BalanceReplenishDialog
          student={replenishStudent}
          open={Boolean(replenishId)}
          onClose={() => setReplenishId(null)}
        />
      ) : null}
    </div>
  );
}
