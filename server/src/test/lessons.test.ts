import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('lessons', () => {
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

  async function createStudent(agent: ReturnType<typeof request.agent>) {
    const res = await agent.post('/api/students').send({ name: 'Student' }).expect(201);
    return res.body.id as string;
  }

  it('create/list within range; range filtering', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const inWeek = '2030-06-03T10:00:00.000Z';
    const outOfWeek = '2030-06-12T10:00:00.000Z';

    await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: inWeek,
        durationMin: 60,
      })
      .expect(201);

    await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: outOfWeek,
        durationMin: 60,
      })
      .expect(201);

    const inRange = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-01T00:00:00.000Z', to: '2030-06-08T00:00:00.000Z' })
      .expect(200);

    expect(inRange.body).toHaveLength(1);
    expect(inRange.body[0].status).toBe('planned');
    expect(inRange.body[0].paid).toBe(false);
  });

  it('create with academicUnits sets duration from tutor academic hour', async () => {
    const { agent } = await registerTutor(app);
    await agent.patch('/api/auth/me').send({ academicHourMin: 45 }).expect(200);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: '2026-06-02T10:00:00.000Z',
        academicUnits: 2,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      academicUnits: 2,
      durationMin: 90,
    });
  });

  it('UTC storage — offset input stored/returned as Z', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: '2026-06-02T12:00:00+02:00',
        durationMin: 45,
      })
      .expect(201);

    expect(created.body.startUtc).toBe('2026-06-02T10:00:00.000Z');

    const list = await agent
      .get('/api/lessons')
      .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T00:00:00.000Z' })
      .expect(200);

    expect(list.body[0].startUtc).toBe('2026-06-02T10:00:00.000Z');
  });

  it('patch and delete', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const lesson = await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: '2026-06-02T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    const patched = await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'completed', paid: true })
      .expect(200);

    expect(patched.body.status).toBe('completed');
    expect(patched.body.paid).toBe(true);

    await agent.delete(`/api/lessons/${lesson.body.id}`).expect(204);

    const afterDelete = await agent
      .get('/api/lessons')
      .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T00:00:00.000Z' })
      .expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('tenant isolation', async () => {
    const a = await registerTutor(app);
    const b = await registerTutor(app);

    const studentA = await a.agent.post('/api/students').send({ name: 'A Student' }).expect(201);
    const lesson = await a.agent
      .post('/api/lessons')
      .send({
        studentId: studentA.body.id,
        startUtc: '2026-06-02T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    await b.agent
      .get('/api/lessons')
      .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z' })
      .expect(200)
      .then((res) => expect(res.body).toHaveLength(0));

    await b.agent.patch(`/api/lessons/${lesson.body.id}`).send({ paid: true }).expect(404);
    await b.agent.delete(`/api/lessons/${lesson.body.id}`).expect(404);

    await b.agent
      .post('/api/lessons')
      .send({
        studentId: studentA.body.id,
        startUtc: '2026-06-02T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(400);
  });

  it('validation errors → 400', async () => {
    const { agent } = await registerTutor(app);
    const res = await agent
      .get('/api/lessons')
      .query({ from: 'bad', to: '2026-06-02T00:00:00.000Z' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
