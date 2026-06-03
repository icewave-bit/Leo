/**
 * Модель оплаты:
 * - Уроки на балансе = уже получены деньги репетитору (предоплата).
 * - Проведение с предоплаты → paid=true, без долга по уроку.
 * - Проведение при 0 → долг, paid=false; оплата вручную или при пополнении баланса.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

type LessonRow = {
  status: string;
  paid: boolean;
  balanceCharged: boolean;
  chargeDebtDelta: number;
  balancePaidApplied: boolean;
};

type StudentRow = { prepaid: number; debt: number };

function lessonDebtClosedUi(lesson: LessonRow): boolean {
  if (lesson.status !== 'completed' || !lesson.balanceCharged) return false;
  const openDebt = lesson.chargeDebtDelta > 0 && !lesson.balancePaidApplied;
  return lesson.paid || !openDebt;
}

describe('lesson paid semantics', () => {
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
    return {
      from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
  }

  it('prepaid on balance: after conduct 5→4, paid true, no lesson debt', async () => {
    const { agent } = await registerTutor(app);
    await agent
      .post('/api/students')
      .send({ name: 'Advance', balanceKind: 'lessons', prepaid: 5, debt: 0 })
      .expect(201);

    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    const student = (await agent.get('/api/students').expect(200)).body[0];
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'completed' })
      .expect(200);

    const row = (await agent.get('/api/lessons').query(weekQuery())).body[0] as LessonRow;
    const stu = (await agent.get('/api/students').expect(200)).body[0] as StudentRow;

    expect(row.chargeDebtDelta).toBe(0);
    expect(row.paid).toBe(true);
    expect(stu.prepaid).toBe(4);
    expect(stu.debt).toBe(0);
    expect(lessonDebtClosedUi(row)).toBe(true);
  });

  it('zero balance: after conduct debt +1, paid false until tutor marks paid', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Zero', balanceKind: 'lessons', prepaid: 0, debt: 0 })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    let row = (await agent.get('/api/lessons').query(weekQuery())).body[0] as LessonRow;
    expect(row.paid).toBe(false);
    expect(row.chargeDebtDelta).toBe(1);
    expect(lessonDebtClosedUi(row)).toBe(false);

    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ paid: true }).expect(200);

    row = (await agent.get('/api/lessons').query(weekQuery())).body[0] as LessonRow;
    const stu = (await agent.get('/api/students').expect(200)).body[0] as StudentRow;
    expect(row.paid).toBe(true);
    expect(stu.debt).toBe(0);
    expect(lessonDebtClosedUi(row)).toBe(true);
  });

  it('bulk top-up marks oldest unpaid debt lessons as paid', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', balanceKind: 'lessons', prepaid: 0, debt: 0 })
      .expect(201);

    for (let i = 0; i < 2; i++) {
      const startUtc = new Date(Date.now() - (i + 2) * 3_600_000).toISOString();
      await agent
        .post('/api/lessons')
        .send({ studentId: student.body.id, startUtc, durationMin: 60 })
        .expect(201);
    }

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ prepaid: 2, debt: 0 })
      .expect(200);

    const lessons = (await agent.get('/api/lessons').query(weekQuery())).body as LessonRow[];
    expect(lessons.every((l) => l.paid)).toBe(true);
    expect((await agent.get('/api/students')).body[0].debt).toBe(0);
  });
});
