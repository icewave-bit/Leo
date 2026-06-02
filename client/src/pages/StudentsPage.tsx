import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  selectedStudentIdAtom,
  studentDrawerModeAtom,
  studentsAtom,
} from '../atoms/schedule';
import { StudentDrawer } from '../components/students/StudentDrawer';
import { fmtBalanceNet, fmtMoney } from '../utils/format';

export function StudentsPage() {
  const students = useAtomValue(studentsAtom);
  const [drawerMode, setDrawerMode] = useAtom(studentDrawerModeAtom);
  const [selectedId, setSelectedId] = useAtom(selectedStudentIdAtom);
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { studentId: routeId } = useParams();
  const navigate = useNavigate();

  const openId = routeId ?? searchParams.get('id') ?? selectedId;

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

  const drawerOpen = drawerMode !== null;
  const showDrawer = drawerOpen && (drawerMode === 'create' || (drawerMode === 'edit' && openId));

  return (
    <div className="page">
      <header className="top">
        <div className="top__l">
          <h1 className="top__title">Студенты</h1>
        </div>
        <div className="top__r">
          <input
            className="students-search field__control"
            type="search"
            placeholder="Поиск по имени…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск"
          />
          <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
            + Ученик
          </button>
        </div>
      </header>

      <div className="students-board">
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
            {filtered.map((s) => {
              const net = s.prepaid - s.debt;
              const balanceLabel = fmtBalanceNet(s.prepaid, s.debt, s.balanceKind, s.currency);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="students-row"
                    onClick={() => openEdit(s.id)}
                  >
                    <span
                      className="avatar"
                      style={{ background: `oklch(0.62 0.13 ${s.hue})` }}
                    >
                      {s.initials}
                    </span>
                    <span className="students-row__main">
                      <strong>{s.name}</strong>
                      <span className="students-row__sub">
                        {s.group ? `Группа · ${s.members.length} уч.` : 'Индивидуально'}
                        {s.rate != null ? ` · ${fmtMoney(s.rate, s.currency)}/ак. ч` : ''}
                      </span>
                    </span>
                    <span
                      className={
                        'students-row__balance' +
                        (net > 0 ? ' students-row__balance--credit' : net < 0 ? ' students-row__balance--debt' : '')
                      }
                    >
                      {balanceLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showDrawer ? (
        <StudentDrawer
          mode={drawerMode!}
          studentId={drawerMode === 'edit' ? openId ?? undefined : undefined}
          onClose={closeDrawer}
          onCreated={(id) => openEdit(id)}
        />
      ) : null}
    </div>
  );
}
