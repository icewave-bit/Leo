import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('billing student', () => {
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

  it('charges payer balance when dependent lesson completes', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Sasha', balanceKind: 'money', prepaid: 100, debt: 0, rate: 30, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({
        name: 'Masha',
        rate: 25,
        currency: 'EUR',
        billingStudentId: payer.body.id,
      })
      .expect(201);

    expect(child.body).toMatchObject({
      billingStudentId: payer.body.id,
      prepaid: 0,
      debt: 0,
      excludeFromTaxes: true,
    });

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);

    const lessons = await agent.get('/api/lessons').query(weekQuery()).expect(200);
    expect(lessons.body[0].balanceCharged).toBe(true);
    expect(lessons.body[0].paid).toBe(true);

    const students = await agent.get('/api/students').expect(200);
    const payerRow = students.body.find((s: { id: string }) => s.id === payer.body.id);
    const childRow = students.body.find((s: { id: string }) => s.id === child.body.id);
    expect(payerRow.prepaid).toBe(75);
    expect(childRow.prepaid).toBe(0);
  });

  it('rejects balance patch on dependent student', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent.post('/api/students').send({ name: 'Payer', prepaid: 50 }).expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', billingStudentId: payer.body.id })
      .expect(201);

    const res = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({ prepaid: 10, debt: 0 })
      .expect(409);
    expect(res.body.error.message).toMatch(/billing payer/i);
  });

  it('allows rate patch on dependent without balance fields', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', balanceKind: 'money', currency: 'USD', rate: 20 })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'USD', billingStudentId: payer.body.id })
      .expect(201);

    const res = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({ rate: 5 })
      .expect(200);
    expect(res.body.rate).toBe(5);
    expect(res.body.billingStudentId).toBe(payer.body.id);
  });

  it('allows autosave-shaped profile patch on dependent', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent.post('/api/students').send({ name: 'Payer', currency: 'USD' }).expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'USD', billingStudentId: payer.body.id })
      .expect(201);

    const res = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({
        name: 'Child',
        rate: 5,
        tz: 'Europe/Moscow',
        note: null,
        isGroup: false,
        members: [],
      })
      .expect(200);
    expect(res.body.rate).toBe(5);
  });

  it('rejects billing cycle and payer-with-payer', async () => {
    const { agent } = await registerTutor(app);
    const a = await agent.post('/api/students').send({ name: 'A' }).expect(201);
    const b = await agent
      .post('/api/students')
      .send({ name: 'B', billingStudentId: a.body.id })
      .expect(201);

    const res = await agent
      .patch(`/api/students/${a.body.id}`)
      .send({ billingStudentId: b.body.id })
      .expect(400);
    expect(res.body.error.message).toMatch(/billing payer|other students bill/i);

    const c = await agent.post('/api/students').send({ name: 'C' }).expect(201);
    await agent
      .patch(`/api/students/${c.body.id}`)
      .send({ billingStudentId: b.body.id })
      .expect(400);
  });

  it('links billing payer when payload also includes currency (autosave shape)', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', currency: 'EUR', balanceKind: 'money', prepaid: 50 })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', currency: 'EUR', rate: 20 })
      .expect(201);

    const updated = await agent
      .patch(`/api/students/${child.body.id}`)
      .send({
        name: 'Child',
        currency: 'EUR',
        billingStudentId: payer.body.id,
        excludeFromTaxes: true,
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      billingStudentId: payer.body.id,
      currency: 'EUR',
      balanceKind: 'money',
      excludeFromTaxes: true,
      prepaid: 0,
      debt: 0,
    });
  });

  it('rejects archiving payer with dependents', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent.post('/api/students').send({ name: 'Payer' }).expect(201);
    await agent
      .post('/api/students')
      .send({ name: 'Child', billingStudentId: payer.body.id })
      .expect(201);

    const res = await agent.post(`/api/students/${payer.body.id}/archive`).expect(409);
    expect(res.body.error.message).toMatch(/billing payer/i);
  });

  it('settle top-up covers dependent lesson debt', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', balanceKind: 'money', prepaid: 0, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    let students = await agent.get('/api/students').expect(200);
    const payerAfter = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerAfter.debt).toBe(20);

    await agent
      .patch(`/api/students/${payer.body.id}`)
      .send({ prepaid: 20, debt: 0 })
      .expect(200);

    const updatedLesson = await agent.get('/api/lessons').query(weekQuery()).expect(200);
    expect(updatedLesson.body.find((l: { id: string }) => l.id === lesson.body.id).paid).toBe(true);

    students = await agent.get('/api/students').expect(200);
    const payerFinal = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerFinal.debt).toBe(0);
  });

  it('settle manual payer debt when family has no open lesson debts', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({
        name: 'Payer',
        prepaid: 20,
        debt: 400,
        rate: 20,
        currency: 'EUR',
      })
      .expect(201);
    await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    await agent
      .patch(`/api/students/${payer.body.id}`)
      .send({ prepaid: 180 })
      .expect(200);

    const students = await agent.get('/api/students').expect(200);
    const payerRow = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerRow.prepaid).toBe(20);
    expect(payerRow.debt).toBe(240);
  });

  it('settle dependent no_show debt when payer is topped up', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', balanceKind: 'money', prepaid: 0, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'no_show', paid: true })
      .expect(200);

    let students = await agent.get('/api/students').expect(200);
    const childRow = students.body.find((s: { id: string }) => s.id === child.body.id);
    expect(childRow.openLessonDebt).toBe(20);

    await agent
      .patch(`/api/students/${payer.body.id}`)
      .send({ prepaid: 20 })
      .expect(200);

    students = await agent.get('/api/students').expect(200);
    const childAfter = students.body.find((s: { id: string }) => s.id === child.body.id);
    const payerAfter = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(childAfter.openLessonDebt).toBe(0);
    expect(payerAfter.debt).toBe(0);
    expect(payerAfter.prepaid).toBe(0);
  });

  it('records chargedForStudentId on lesson movement', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', prepaid: 50, rate: 10, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 10, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const movements = await agent
      .get('/api/balance-movements')
      .query({ from, to, studentId: child.body.id })
      .expect(200);

    expect(movements.body).toHaveLength(1);
    expect(movements.body[0]).toMatchObject({
      studentId: payer.body.id,
      chargedForStudentId: child.body.id,
      kind: 'lesson_charge',
    });
  });

  it('returns billing debt breakdown by family member', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', balanceKind: 'money', prepaid: 0, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 25, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    const breakdown = await agent
      .get(`/api/students/${payer.body.id}/billing-debt`)
      .expect(200);

    expect(breakdown.body.walletDebt).toBe(25);
    expect(breakdown.body.entries).toEqual([
      { studentId: child.body.id, studentName: 'Child', openDebt: 25 },
    ]);

    const list = await agent.get('/api/students').expect(200);
    const childRow = list.body.find((s: { id: string }) => s.id === child.body.id);
    expect(childRow.openLessonDebt).toBe(25);
  });

  it('deducts payer money using attendee rate when rates differ', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({
        name: 'Payer',
        prepaid: 200,
        debt: 0,
        rate: 20,
        currency: 'EUR',
      })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 30, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    const students = await agent.get('/api/students').expect(200);
    const payerRow = students.body.find((s: { id: string }) => s.id === payer.body.id);
    expect(payerRow.prepaid).toBe(170);
  });

  it('transfers dependent wallet debt to payer and settles from payer prepaid on link', async () => {
    const { agent } = await registerTutor(app);
    const nastya = await agent
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
    const sancho = await agent
      .post('/api/students')
      .send({
        name: 'Sancho',
        balanceKind: 'lessons',
        prepaid: 0,
        debt: 3,
        rate: 12,
        currency: 'USD',
      })
      .expect(201);

    const linked = await agent
      .patch(`/api/students/${sancho.body.id}`)
      .send({ billingStudentId: nastya.body.id })
      .expect(200);

    expect(linked.body).toMatchObject({
      billingStudentId: nastya.body.id,
      prepaid: 0,
      debt: 0,
    });

    const students = await agent.get('/api/students').expect(200);
    const nastyaRow = students.body.find((s: { id: string }) => s.id === nastya.body.id);
    expect(nastyaRow.prepaid).toBe(64);
    expect(nastyaRow.debt).toBe(0);
  });

  it('leaves remainder on payer debt when prepaid cannot cover transferred debt', async () => {
    const { agent } = await registerTutor(app);
    const nastya = await agent
      .post('/api/students')
      .send({
        name: 'Nastya',
        balanceKind: 'money',
        prepaid: 10,
        debt: 0,
        rate: 12,
        currency: 'USD',
      })
      .expect(201);
    const sancho = await agent
      .post('/api/students')
      .send({
        name: 'Sancho',
        balanceKind: 'lessons',
        prepaid: 0,
        debt: 3,
        rate: 12,
        currency: 'USD',
      })
      .expect(201);

    await agent
      .patch(`/api/students/${sancho.body.id}`)
      .send({ billingStudentId: nastya.body.id })
      .expect(200);

    const students = await agent.get('/api/students').expect(200);
    const nastyaRow = students.body.find((s: { id: string }) => s.id === nastya.body.id);
    expect(nastyaRow.prepaid).toBe(0);
    expect(nastyaRow.debt).toBe(26);
  });
});
