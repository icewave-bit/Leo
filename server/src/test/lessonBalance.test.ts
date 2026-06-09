import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

const RATE = 20;

describe('lesson balance', () => {
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

  it('auto-completes past planned lesson and deducts prepaid', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 5 * RATE, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    const list = await agent.get('/api/lessons').query(weekQuery()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].status).toBe('completed');
    expect(list.body[0].balanceCharged).toBe(true);
    expect(list.body[0].paid).toBe(true);
    expect(list.body[0].chargeDebtDelta).toBe(0);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(4 * RATE);
  });

  it('auto-marks paid when lesson fully covered from prepaid on complete', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 2 * RATE, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'completed' })
      .expect(200);

    expect((await agent.get('/api/lessons').query(weekQuery())).body[0].paid).toBe(true);
    expect((await agent.get('/api/lessons').query(weekQuery())).body[0].chargeDebtDelta).toBe(
      0,
    );
  });

  it('reverses charge when status changes from completed to cancelled', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 3 * RATE, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(3 * RATE);
  });

  it('completed in debt stays unpaid until tutor marks paid', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', prepaid: 0, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    let row = (await agent.get('/api/lessons').query(weekQuery())).body[0];
    expect(row.paid).toBe(false);
    expect(row.chargeDebtDelta).toBe(RATE);

    let students = await agent.get('/api/students').expect(200);
    expect(students.body[0].debt).toBe(RATE);

    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ paid: true }).expect(200);

    students = await agent.get('/api/students').expect(200);
    expect(students.body[0].debt).toBe(0);
    row = (await agent.get('/api/lessons').query(weekQuery())).body[0];
    expect(row.paid).toBe(true);
  });

  it('settle unpaid completed lessons when student balance is topped up', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', prepaid: 0, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    for (let i = 0; i < 3; i++) {
      const startUtc = new Date(Date.now() - (i + 2) * 3_600_000).toISOString();
      await agent
        .post('/api/lessons')
        .send({ studentId: student.body.id, startUtc, durationMin: 60 })
        .expect(201);
    }

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    let lessons = (await agent.get('/api/lessons').query(weekQuery())).body;
    expect(lessons.every((l: { paid: boolean }) => !l.paid)).toBe(true);
    expect((await agent.get('/api/students')).body[0].debt).toBe(3 * RATE);

    await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ prepaid: 3 * RATE, debt: 0 })
      .expect(200);

    lessons = (await agent.get('/api/lessons').query(weekQuery())).body;
    expect(lessons.every((l: { paid: boolean }) => l.paid)).toBe(true);
    expect((await agent.get('/api/students')).body[0].debt).toBe(0);
  });

  it('settle manual wallet debt when topped up without open lesson debts', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({
        name: 'Manual debt',
        prepaid: RATE,
        debt: 20 * RATE,
        rate: RATE,
        currency: 'EUR',
      })
      .expect(201);

    await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ prepaid: 9 * RATE })
      .expect(200);

    const row = (await agent.get('/api/students')).body[0];
    expect(row.prepaid).toBe(RATE);
    expect(row.debt).toBe(12 * RATE);
  });

  it('settle open debt on no_show/cancelled lessons marked paid (matches openLessonDebt)', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', prepaid: 0, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'no_show', paid: true })
      .expect(200);

    let students = await agent.get('/api/students').expect(200);
    expect(students.body[0].openLessonDebt).toBe(RATE);

    await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ prepaid: RATE })
      .expect(200);

    students = await agent.get('/api/students').expect(200);
    expect(students.body[0].openLessonDebt).toBe(0);
    expect(students.body[0].debt).toBe(0);
    expect(students.body[0].prepaid).toBe(0);
  });

  it('cancelled lesson charges balance when paid toggled on', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Late', prepaid: RATE, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'cancelled', paid: true })
      .expect(200);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(0);
    expect(students.body[0].debt).toBe(0);
  });

  it('delete with restoreBalance refunds charge', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 2 * RATE, debt: 0, rate: RATE, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    await agent
      .delete(`/api/lessons/${lesson.body.id}?restoreBalance=true`)
      .expect(204);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(2 * RATE);
  });
});
