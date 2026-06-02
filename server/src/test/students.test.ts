import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('students', () => {
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

  it('create + list returns only own students; defaults applied', async () => {
    const { agent } = await registerTutor(app, { timezone: 'Europe/Berlin' });

    const created = await agent
      .post('/api/students')
      .send({ name: 'Maria' })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Maria',
      initials: 'MA',
      hue: 250,
      tz: 'Europe/Berlin',
      currency: 'EUR',
      balanceKind: 'money',
      isGroup: false,
      members: [],
    });

    const list = await agent.get('/api/students').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].tutorId).toBe(created.body.tutorId);
  });

  it('tenant isolation — B cannot see A students', async () => {
    const a = await registerTutor(app);
    const b = await registerTutor(app);

    const student = await a.agent.post('/api/students').send({ name: 'Secret' }).expect(201);

    const bList = await b.agent.get('/api/students').expect(200);
    expect(bList.body).toHaveLength(0);

    await b.agent.get(`/api/students/${student.body.id}`).expect(404);
  });

  it('validation errors → 400', async () => {
    const { agent } = await registerTutor(app);
    const res = await agent.post('/api/students').send({ name: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('create with lessons balance kind', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent
      .post('/api/students')
      .send({ name: 'Pack', balanceKind: 'lessons', prepaid: 5, debt: 1 })
      .expect(201);

    expect(created.body).toMatchObject({
      balanceKind: 'lessons',
      prepaid: 5,
      debt: 1,
    });
  });

  it('patch updates fields including balance', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Alex' }).expect(201);

    const updated = await agent
      .patch(`/api/students/${created.body.id}`)
      .send({ prepaid: 120, debt: 30, rate: 25, currency: 'EUR' })
      .expect(200);

    expect(updated.body).toMatchObject({
      prepaid: 120,
      debt: 30,
      rate: 25,
      currency: 'EUR',
    });
  });

  it('delete student without lessons', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Temp' }).expect(201);

    await agent.delete(`/api/students/${created.body.id}`).expect(204);

    const list = await agent.get('/api/students').expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('delete blocked when lessons exist', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Busy' }).expect(201);

    await agent
      .post('/api/lessons')
      .send({
        studentId: created.body.id,
        startUtc: new Date().toISOString(),
        durationMin: 60,
      })
      .expect(201);

    const res = await agent.delete(`/api/students/${created.body.id}`).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
