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
});
