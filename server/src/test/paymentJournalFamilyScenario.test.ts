import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

const RATE = 1333;
const LESSONS = 6;
const TOP_UP = 4000;
const TOTAL_DEBT = LESSONS * RATE; // 7998

type StudentRow = {
  id: string;
  name: string;
  prepaid: number;
  debt: number;
  openLessonDebt: number;
};

type LessonRow = {
  id: string;
  studentId: string;
  startUtc: string;
  paid: boolean;
  balanceCharged: boolean;
  chargeDebtDelta: number;
};

type MovementRow = {
  id: string;
  kind: string;
  studentId: string;
  chargedForStudentId: string | null;
  prepaidDelta: number;
  debtDelta: number;
  prepaidAfter: number;
  debtAfter: number;
  lessonId: string | null;
  parentMovementId: string | null;
};

const MOVEMENT_LABELS: Record<string, string> = {
  replenish: 'Пополнение',
  manual: 'Корректировка',
  lesson_charge: 'Списание за урок',
  lesson_paid: 'Оплата урока',
  lesson_reverse: 'Отмена списания',
};

/** Same as UI: one signed balance number (prepaid − debt). */
function fmtBalance(prepaid: number, debt: number): string {
  const n = prepaid - debt;
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Same as UI journal «Сумма»: prepaidDelta − debtDelta. */
function fmtAmount(prepaidDelta: number, debtDelta: number): string {
  const n = prepaidDelta - debtDelta;
  if (Math.abs(n) < 1e-9) return '—';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

describe('payment journal family scenario', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
    app = await createApp();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  function weekQuery() {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    return { from, to };
  }

  function journalQuery() {
    return {
      from: new Date(0).toISOString(),
      to: new Date(Date.now() + 86_400_000).toISOString(),
    };
  }

  function byKind(movements: MovementRow[], kind: string) {
    return movements.filter((m) => m.kind === kind);
  }

  /**
   * Dump like PaymentsJournal UI after grouping:
   * main timeline excludes settle children; compound replenish shows allocations.
   */
  function dumpSnapshot(
    title: string,
    nameById: Map<string, string>,
    students: StudentRow[],
    lessons: LessonRow[],
    movements: MovementRow[],
  ) {
    const order = ['A', 'B', 'C'];
    const balanceLines = order
      .map((name) => {
        const row = students.find((s) => s.name === name);
        if (!row) return `  ${name}: (нет)`;
        const isDependent = name !== 'C';
        if (isDependent) {
          const lessonDebt =
            row.openLessonDebt > 0 ? String(row.openLessonDebt) : 'нет';
          return (
            `  ${name}: личный баланс не ведётся` +
            `  |  Долг за уроки: ${lessonDebt}` +
            `  |  (платит через C)`
          );
        }
        return `  ${name}: Баланс ${fmtBalance(row.prepaid, row.debt)}`;
      })
      .join('\n');

    const sortedLessons = [...lessons].sort(
      (x, y) => new Date(x.startUtc).getTime() - new Date(y.startUtc).getTime(),
    );
    const lessonLines = sortedLessons
      .map((l, i) => {
        const who = nameById.get(l.studentId) ?? '?';
        return `  #${i + 1} ${who}  ${l.paid ? 'оплачен' : 'не оплачен'}`;
      })
      .join('\n');

    const childrenByParent = new Map<string, MovementRow[]>();
    for (const m of movements) {
      if (!m.parentMovementId) continue;
      const list = childrenByParent.get(m.parentMovementId) ?? [];
      list.push(m);
      childrenByParent.set(m.parentMovementId, list);
    }

    const main = movements.filter((m) => m.parentMovementId == null);
    // API newest-first → print oldest→newest
    const journalLines = [...main]
      .reverse()
      .flatMap((m, i) => {
        const forName = m.chargedForStudentId
          ? nameById.get(m.chargedForStudentId)
          : undefined;
        const children = childrenByParent.get(m.id) ?? [];
        const isCompound = m.kind === 'replenish' && children.length > 0;
        const base = isCompound
          ? 'Пополнение — Списание'
          : forName
            ? `${MOVEMENT_LABELS[m.kind] ?? m.kind} · ${forName}`
            : (MOVEMENT_LABELS[m.kind] ?? m.kind);
        const amount = fmtAmount(m.prepaidDelta, m.debtDelta);
        const balance = fmtBalance(m.prepaidAfter, m.debtAfter);
        const head =
          `  #${String(i + 1).padStart(2)}  ${base.padEnd(28)}` +
          `  Сумма ${amount.padStart(6)}  Баланс ${balance}`;
        if (!isCompound) return [head];
        const allocLines = [...children]
          .reverse()
          .map((c) => {
            const whom = c.chargedForStudentId
              ? nameById.get(c.chargedForStudentId)
              : undefined;
            const label = whom ? `Оплата урока · ${whom}` : 'Оплата урока';
            const allocAmt = Math.abs(c.debtDelta) || Math.abs(c.prepaidDelta);
            return `       └ ${label.padEnd(24)}  ${allocAmt}`;
          });
        const allocated = children.reduce(
          (s, c) => s + (Math.abs(c.debtDelta) || Math.abs(c.prepaidDelta)),
          0,
        );
        const remainder = m.prepaidDelta - allocated;
        if (remainder > 1e-9) {
          allocLines.push(`       └ ${'Остаток на балансе'.padEnd(24)}  ${remainder}`);
        }
        return [head + '  ▼', ...allocLines];
      })
      .join('\n');

    process.stdout.write(
      [
        '',
        '════════════════════════════════════════════════════════════',
        title,
        '────────────────────────────────────────────────────────────',
        'Балансы учеников (как в UI):',
        balanceLines,
        'Уроки (FIFO):',
        lessonLines || '  (нет)',
        'Журнал (главная лента; ▼ = раскрытие «на что ушло»):',
        journalLines || '  (пусто)',
        '════════════════════════════════════════════════════════════',
        '',
      ].join('\n') + '\n',
    );
  }

  it('A/B bill through C: charge → top-up settle → full settle (FIFO)', async () => {
    const { agent } = await registerTutor(app);

    // --- Phase setup ---
    const c = await agent
      .post('/api/students')
      .send({
        name: 'C',
        balanceKind: 'money',
        prepaid: 0,
        debt: 0,
        rate: RATE,
        currency: 'EUR',
      })
      .expect(201);

    const a = await agent
      .post('/api/students')
      .send({
        name: 'A',
        rate: RATE,
        currency: 'EUR',
        billingStudentId: c.body.id,
      })
      .expect(201);

    const b = await agent
      .post('/api/students')
      .send({
        name: 'B',
        rate: RATE,
        currency: 'EUR',
        billingStudentId: c.body.id,
      })
      .expect(201);

    const nameById = new Map<string, string>([
      [a.body.id, 'A'],
      [b.body.id, 'B'],
      [c.body.id, 'C'],
    ]);

    // Oldest → newest: C1, A1, B1, C2, A2, B2
    const lessonSpecs: { studentId: string; hoursAgo: number }[] = [
      { studentId: c.body.id, hoursAgo: 12 },
      { studentId: a.body.id, hoursAgo: 11 },
      { studentId: b.body.id, hoursAgo: 10 },
      { studentId: c.body.id, hoursAgo: 9 },
      { studentId: a.body.id, hoursAgo: 8 },
      { studentId: b.body.id, hoursAgo: 7 },
    ];

    for (const spec of lessonSpecs) {
      const startUtc = new Date(Date.now() - spec.hoursAgo * 3_600_000).toISOString();
      await agent
        .post('/api/lessons')
        .send({ studentId: spec.studentId, startUtc, durationMin: 60 })
        .expect(201);
    }

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    // --- Test 1: initial state after charges, before top-up ---
    let students = (await agent.get('/api/students').expect(200)).body as StudentRow[];
    const rowC = students.find((s) => s.id === c.body.id)!;
    const rowA = students.find((s) => s.id === a.body.id)!;
    const rowB = students.find((s) => s.id === b.body.id)!;

    expect(rowC.prepaid).toBe(0);
    expect(rowC.debt).toBe(TOTAL_DEBT);
    expect(rowC.openLessonDebt).toBe(2 * RATE);
    expect(rowA.prepaid).toBe(0);
    expect(rowA.debt).toBe(0);
    expect(rowA.openLessonDebt).toBe(2 * RATE);
    expect(rowB.prepaid).toBe(0);
    expect(rowB.debt).toBe(0);
    expect(rowB.openLessonDebt).toBe(2 * RATE);

    let lessons = (await agent.get('/api/lessons').query(weekQuery()).expect(200))
      .body as LessonRow[];
    expect(lessons).toHaveLength(LESSONS);
    for (const lesson of lessons) {
      expect(lesson.balanceCharged).toBe(true);
      expect(lesson.paid).toBe(false);
      expect(lesson.chargeDebtDelta).toBe(RATE);
    }

    let movements = (
      await agent.get('/api/balance-movements').query(journalQuery()).expect(200)
    ).body as MovementRow[];

    const charges = byKind(movements, 'lesson_charge');
    expect(charges).toHaveLength(LESSONS);
    expect(byKind(movements, 'replenish')).toHaveLength(0);
    expect(byKind(movements, 'lesson_paid')).toHaveLength(0);

    for (const charge of charges) {
      expect(charge.studentId).toBe(c.body.id);
      expect(charge.debtDelta).toBe(RATE);
    }

    const chargedForByLessonId = new Map(
      charges.map((m) => [m.lessonId, m.chargedForStudentId]),
    );
    const lessonsByStart = [...lessons].sort(
      (x, y) => new Date(x.startUtc).getTime() - new Date(y.startUtc).getTime(),
    );
    expect(chargedForByLessonId.get(lessonsByStart[0].id)).toBeNull();
    expect(chargedForByLessonId.get(lessonsByStart[1].id)).toBe(a.body.id);
    expect(chargedForByLessonId.get(lessonsByStart[2].id)).toBe(b.body.id);
    expect(chargedForByLessonId.get(lessonsByStart[3].id)).toBeNull();
    expect(chargedForByLessonId.get(lessonsByStart[4].id)).toBe(a.body.id);
    expect(chargedForByLessonId.get(lessonsByStart[5].id)).toBe(b.body.id);

    dumpSnapshot(
      'ТЕСТ 1 — после 6 списаний (до пополнения)',
      nameById,
      students,
      lessons,
      movements,
    );

    // --- Action: top up C by 4000 ---
    process.stdout.write(`\n>>> ДЕЙСТВИЕ: пополнить C на ${TOP_UP}\n\n`);
    await agent.patch(`/api/students/${c.body.id}`).send({ prepaid: TOP_UP }).expect(200);

    // --- Test 2: after first top-up ---
    // FIFO settles 3 full lessons (3999). Leftover prepaid 1 kept while open
    // lesson debts remain (no silent paydown against wallet debt).
    students = (await agent.get('/api/students').expect(200)).body as StudentRow[];
    expect(students.find((s) => s.id === c.body.id)).toMatchObject({
      prepaid: 1,
      debt: TOTAL_DEBT - 3 * RATE, // 3999
    });
    expect(students.find((s) => s.id === a.body.id)).toMatchObject({ prepaid: 0, debt: 0 });
    expect(students.find((s) => s.id === b.body.id)).toMatchObject({ prepaid: 0, debt: 0 });

    lessons = (await agent.get('/api/lessons').query(weekQuery()).expect(200)).body as LessonRow[];
    const sortedAfterFirst = [...lessons].sort(
      (x, y) => new Date(x.startUtc).getTime() - new Date(y.startUtc).getTime(),
    );
    expect(sortedAfterFirst.slice(0, 3).every((l) => l.paid)).toBe(true);
    expect(sortedAfterFirst.slice(3).every((l) => !l.paid)).toBe(true);

    movements = (
      await agent.get('/api/balance-movements').query(journalQuery()).expect(200)
    ).body as MovementRow[];
    expect(byKind(movements, 'lesson_charge')).toHaveLength(LESSONS);
    expect(byKind(movements, 'lesson_paid')).toHaveLength(3);
    const replenish1 = byKind(movements, 'replenish');
    expect(replenish1).toHaveLength(1);
    expect(replenish1[0].prepaidDelta).toBe(TOP_UP);
    expect(replenish1[0].studentId).toBe(c.body.id);
    expect(fmtBalance(replenish1[0].prepaidAfter, replenish1[0].debtAfter)).toBe('−3998');

    const paid1 = byKind(movements, 'lesson_paid');
    expect(paid1.every((m) => m.parentMovementId === replenish1[0].id)).toBe(true);
    expect(paid1.every((m) => m.prepaidDelta === -RATE && m.debtDelta === -RATE)).toBe(true);

    // Main timeline: 6 charges + 1 compound replenish (children nested)
    expect(movements.filter((m) => m.parentMovementId == null)).toHaveLength(LESSONS + 1);

    dumpSnapshot(
      'ТЕСТ 2 — после 1-го пополнения C +4000',
      nameById,
      students,
      lessons,
      movements,
    );

    // --- Action: top up C by another 4000 (absolute prepaid; current is 1 → 4001) ---
    process.stdout.write(`\n>>> ДЕЙСТВИЕ: пополнить C ещё на ${TOP_UP}\n\n`);
    await agent
      .patch(`/api/students/${c.body.id}`)
      .send({ prepaid: 1 + TOP_UP })
      .expect(200);

    // --- Test 3: final state — all paid; leftover 2 prepaid remains ---
    students = (await agent.get('/api/students').expect(200)).body as StudentRow[];
    expect(students.find((s) => s.id === c.body.id)).toMatchObject({
      prepaid: 2,
      debt: 0,
      openLessonDebt: 0,
    });
    expect(students.find((s) => s.id === a.body.id)).toMatchObject({
      prepaid: 0,
      debt: 0,
      openLessonDebt: 0,
    });
    expect(students.find((s) => s.id === b.body.id)).toMatchObject({
      prepaid: 0,
      debt: 0,
      openLessonDebt: 0,
    });

    lessons = (await agent.get('/api/lessons').query(weekQuery()).expect(200)).body as LessonRow[];
    expect(lessons).toHaveLength(LESSONS);
    expect(lessons.every((l) => l.paid && l.balanceCharged)).toBe(true);

    movements = (
      await agent.get('/api/balance-movements').query(journalQuery()).expect(200)
    ).body as MovementRow[];
    expect(byKind(movements, 'replenish')).toHaveLength(2);
    expect(byKind(movements, 'lesson_charge')).toHaveLength(LESSONS);
    expect(byKind(movements, 'lesson_paid')).toHaveLength(LESSONS);
    expect(
      byKind(movements, 'replenish').every(
        (m) => m.prepaidDelta === TOP_UP && m.studentId === c.body.id,
      ),
    ).toBe(true);

    const replenishes = byKind(movements, 'replenish');
    const paidAll = byKind(movements, 'lesson_paid');
    expect(
      paidAll.every((m) => replenishes.some((r) => r.id === m.parentMovementId)),
    ).toBe(true);
    expect(movements.filter((m) => m.parentMovementId == null)).toHaveLength(LESSONS + 2);

    const lastReplenish = replenishes[0]; // API newest-first
    expect(fmtBalance(lastReplenish.prepaidAfter, lastReplenish.debtAfter)).toBe('+2');

    dumpSnapshot(
      'ТЕСТ 3 — после 2-го пополнения C +4000 (контроль)',
      nameById,
      students,
      lessons,
      movements,
    );
  });
});
