import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('recurring-schedules', () => {
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

  it('creates series on multiple weekdays with end date', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [0, 2],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-24',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      studentId,
      weekdays: [0, 2],
      startMinutes: 600,
      active: true,
      endDate: '2030-06-24',
    });

    const lessons = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' })
      .expect(200);

    expect(lessons.body).toHaveLength(7);
    expect(lessons.body.every((l: { status: string }) => l.status === 'planned')).toBe(true);
    expect(
      lessons.body.every((l: { recurringScheduleId: string }) => l.recurringScheduleId === created.body.id),
    ).toBe(true);
  });

  it('creates unlimited series within rolling horizon', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 720,
        academicUnits: 1,
        startDate: '2030-06-04',
      })
      .expect(201);

    expect(created.body.endDate).toBeNull();

    const lessons = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-01T00:00:00.000Z', to: '2030-09-01T00:00:00.000Z' })
      .expect(200);

    expect(lessons.body.length).toBeGreaterThanOrEqual(12);
    expect(lessons.body.every((l: { recurringScheduleId: string }) => l.recurringScheduleId === created.body.id)).toBe(true);
  });

  it('lists and pauses a series', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [2],
        startMinutes: 720,
        academicUnits: 1,
        startDate: '2030-06-05',
        endDate: '2030-08-01',
      })
      .expect(201);

    const list = await agent.get('/api/recurring-schedules').expect(200);
    expect(list.body).toHaveLength(1);

    await agent
      .patch(`/api/recurring-schedules/${created.body.id}`)
      .send({ active: false })
      .expect(200);

    const futureLessons = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-04T00:00:00.000Z', to: '2030-08-01T00:00:00.000Z' })
      .expect(200);

    expect(futureLessons.body.filter((l: { startUtc: string }) => l.startUtc > new Date().toISOString())).toHaveLength(0);
  });

  it('deletes series and optional future lessons', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [0],
        startMinutes: 540,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-17',
      })
      .expect(201);

    await agent
      .delete(`/api/recurring-schedules/${created.body.id}?deleteFutureLessons=true`)
      .expect(204);

    const list = await agent.get('/api/recurring-schedules').expect(200);
    expect(list.body).toHaveLength(0);

    const lessons = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' })
      .expect(200);

    expect(lessons.body).toHaveLength(0);
  });
});
