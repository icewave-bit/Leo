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

  it('archive removes from active list; restore brings back', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Temp' }).expect(201);

    const archived = await agent
      .post(`/api/students/${created.body.id}/archive`)
      .expect(200);
    expect(archived.body.archivedAt).toBeTruthy();

    const list = await agent.get('/api/students').expect(200);
    expect(list.body).toHaveLength(0);

    const archivedList = await agent.get('/api/students/archived/list').expect(200);
    expect(archivedList.body).toHaveLength(1);
    expect(archivedList.body[0].id).toBe(created.body.id);

    await agent.post(`/api/students/${created.body.id}/restore`).expect(200);

    const activeAgain = await agent.get('/api/students').expect(200);
    expect(activeAgain.body).toHaveLength(1);
    expect(activeAgain.body[0].archivedAt).toBeNull();
  });

  it('archive cancels planned lessons and hides them from schedule list', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Busy' }).expect(201);
    const startUtc = new Date(Date.now() + 86_400_000).toISOString();

    await agent
      .post('/api/lessons')
      .send({
        studentId: created.body.id,
        startUtc,
        durationMin: 60,
      })
      .expect(201);

    await agent.post(`/api/students/${created.body.id}/archive`).expect(200);

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const lessons = await agent.get(`/api/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).expect(200);
    expect(lessons.body).toHaveLength(0);

    const history = await agent
      .get(
        `/api/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${created.body.id}`,
      )
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].status).toBe('cancelled');
  });

  it('permanent delete only when archived', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Gone' }).expect(201);

    const res = await agent.delete(`/api/students/${created.body.id}`).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');

    await agent.post(`/api/students/${created.body.id}/archive`).expect(200);
    await agent.delete(`/api/students/${created.body.id}`).expect(204);

    const archivedList = await agent.get('/api/students/archived/list').expect(200);
    expect(archivedList.body).toHaveLength(0);
  });

  it('purge archived student removes lessons', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent.post('/api/students').send({ name: 'Erase' }).expect(201);

    await agent
      .post('/api/lessons')
      .send({
        studentId: created.body.id,
        startUtc: new Date().toISOString(),
        durationMin: 60,
      })
      .expect(201);

    await agent.post(`/api/students/${created.body.id}/archive`).expect(200);
    await agent.delete(`/api/students/${created.body.id}`).expect(204);

    await agent.get(`/api/students/${created.body.id}`).expect(404);
  });
});
