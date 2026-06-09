import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('balance movements', () => {
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

  it('lists movements after replenish', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Pay Test',
        hue: 200,
        balanceKind: 'money',
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        rate: 50,
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 100 }).expect(200);

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const list = await agent
      .get(
        `/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${studentId}`,
      )
      .expect(200);

    expect(list.body.length).toBeGreaterThanOrEqual(1);
    expect(list.body.some((m: { kind: string }) => m.kind === 'replenish')).toBe(true);
  });

  it('does not record movements when switching balance kind with converted amounts', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Kind Switch',
        hue: 210,
        balanceKind: 'lessons',
        prepaid: 5,
        debt: 0,
        rate: 100,
        currency: 'EUR',
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent
      .patch(`/api/students/${studentId}`)
      .send({ balanceKind: 'money', prepaid: 500, debt: 0 })
      .expect(200);

    await agent
      .patch(`/api/students/${studentId}`)
      .send({ balanceKind: 'lessons', prepaid: 5, debt: 0 })
      .expect(200);

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const list = await agent
      .get(
        `/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${studentId}`,
      )
      .expect(200);

    expect(list.body).toHaveLength(0);
  });

  it('excludes archived students from tutor-wide journal', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({ name: 'Archived Pay', balanceKind: 'money', prepaid: 0, debt: 0 })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 50 }).expect(200);
    await agent.post(`/api/students/${studentId}/archive`).expect(200);

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();

    const all = await agent
      .get(`/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(200);
    expect(all.body.some((m: { studentId: string }) => m.studentId === studentId)).toBe(false);

    const byStudent = await agent
      .get(
        `/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${studentId}`,
      )
      .expect(200);
    expect(byStudent.body.some((m: { kind: string }) => m.kind === 'replenish')).toBe(true);
  });

  it('records manual kind for balance correction with prepaid and debt', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Manual Correct',
        hue: 220,
        balanceKind: 'money',
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        rate: 50,
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent
      .patch(`/api/students/${studentId}`)
      .send({ balanceKind: 'money', prepaid: 80, debt: 0 })
      .expect(200);

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const list = await agent
      .get(
        `/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${studentId}`,
      )
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].kind).toBe('manual');
  });

  it('lists family lesson charges for payer and dependent filters', async () => {
    const { agent } = await registerTutor(app);
    const payer = await agent
      .post('/api/students')
      .send({ name: 'Payer', balanceKind: 'lessons', prepaid: 5, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const child = await agent
      .post('/api/students')
      .send({ name: 'Child', rate: 20, currency: 'EUR', billingStudentId: payer.body.id })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: child.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await agent.get('/api/lessons').query({
      from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    const from = new Date(0).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const byPayer = await agent
      .get(`/api/balance-movements?${q}&studentId=${payer.body.id}`)
      .expect(200);
    expect(
      byPayer.body.some(
        (m: { kind: string; chargedForStudentId: string | null }) =>
          m.kind === 'lesson_charge' && m.chargedForStudentId === child.body.id,
      ),
    ).toBe(true);

    const byChild = await agent
      .get(`/api/balance-movements?${q}&studentId=${child.body.id}`)
      .expect(200);
    expect(
      byChild.body.some(
        (m: { kind: string; chargedForStudentId: string | null }) =>
          m.kind === 'lesson_charge' && m.chargedForStudentId === child.body.id,
      ),
    ).toBe(true);
  });
});
