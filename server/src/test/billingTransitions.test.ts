import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

/** Regression pack: billing link/unlink, openLessonDebt, currency, create-with-payer. */
describe('billing transitions', () => {
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

  it('rejects billing link when currencies differ', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', currency: 'USD' })
      .expect(201);

    const res = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({ billingStudentId: payer.body.id })
      .expect(400);

    expect(res.body.error.message).toMatch(/currency/i);
  });

  it('creates child with billingStudentId and migrates initial debt to payer', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({
        name: 'Nastya',
        balanceKind: 'money',
        prepaid: 100,
        debt: 0,
        rate: 12,
        currency: 'USD',
      })
      .expect(201);

    const child = await agent
      .post('/api/students')
      .send({
        name: 'Sancho',
        balanceKind: 'lessons',
        prepaid: 0,
        debt: 3,
        rate: 12,
        currency: 'USD',
        billingStudentId: payer.body.id,
      })
      .expect(201);

    expect(child.body).toMatchObject({
      billingStudentId: payer.body.id,
      prepaid: 0,
      debt: 0,
    });

    const students = await agent.get('/api/students').expect(200);
    const payerRow = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerRow.prepaid).toBe(64);
    expect(payerRow.debt).toBe(0);
  });

  it('unlink dependent restores own wallet fields without touching payer', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', prepaid: 50, debt: 0, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', billingStudentId: payer.body.id, currency: 'EUR' })
      .expect(201);

    const unlinked = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({ billingStudentId: null })
      .expect(200);

    expect(unlinked.body).toMatchObject({
      billingStudentId: null,
      prepaid: 0,
      debt: 0,
      excludeFromTaxes: false,
    });

    const students = await agent.get('/api/students').expect(200);
    const payerRow = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerRow.prepaid).toBe(50);
    expect(payerRow.debt).toBe(0);
  });

  it('link migrates lesson debt from completed lessons and clears openLessonDebt', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({
        name: 'Nastya',
        balanceKind: 'money',
        prepaid: 100,
        debt: 0,
        rate: 20,
        currency: 'EUR',
      })
      .expect(201);
    const sancho = await agent
      .post('/api/students')
      .send({
        name: 'Sancho',
        prepaid: 0,
        debt: 0,
        rate: 20,
        currency: 'EUR',
      })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: sancho.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    let list = await agent.get('/api/students').expect(200);
    let sanchoRow = list.body.find((s: { id: string }) => s.id === sancho.body.id);
    expect(sanchoRow.openLessonDebt).toBe(20);
    expect(sanchoRow.debt).toBe(20);

    await agent
      .patch(`/api/students/${sancho.body.id}`)
      .send({ billingStudentId: payer.body.id })
      .expect(200);

    list = await agent.get('/api/students').expect(200);
    sanchoRow = list.body.find((s: { id: string }) => s.id === sancho.body.id);
    const payerRow = list.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(sanchoRow.openLessonDebt).toBe(0);
    expect(sanchoRow.debt).toBe(0);
    expect(payerRow.prepaid).toBe(80);
    expect(payerRow.debt).toBe(0);
  });

  it('records manual movement on payer when wallet migrated on link', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', prepaid: 0, debt: 0, rate: 10, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({
        name: 'Child',
        balanceKind: 'lessons',
        prepaid: 0,
        debt: 2,
        rate: 10,
        currency: 'EUR',
      })
      .expect(201);

    await agent
      .patch(`/api/students/${child.body.id}`)
      .send({ billingStudentId: payer.body.id })
      .expect(200);

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const movements = await agent
      .get(`/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${payer.body.id}`)
      .expect(200);

    expect(movements.body).toHaveLength(1);
    expect(movements.body[0]).toMatchObject({
      kind: 'manual',
      studentId: payer.body.id,
      chargedForStudentId: child.body.id,
      debtDelta: 20,
    });
  });

  it('PATCH response includes openLessonDebt', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', prepaid: 0, debt: 0, rate: 15, currency: 'EUR' })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    const patched = await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ note: 'still in debt' })
      .expect(200);

    expect(patched.body.openLessonDebt).toBe(15);
  });
});
