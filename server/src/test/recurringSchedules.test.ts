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

  it('does not recreate original slot after rescheduling one occurrence', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
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

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body).toHaveLength(3);

    const target = before.body[0];
    const newStartUtc = '2030-06-10T14:00:00.000Z';
    await agent.patch(`/api/lessons/${target.id}`).send({ startUtc: newStartUtc }).expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body).toHaveLength(3);
    expect(after.body.some((l: { startUtc: string }) => l.startUtc === target.startUtc)).toBe(false);
    expect(after.body.some((l: { id: string; startUtc: string }) => l.id === target.id && l.startUtc === newStartUtc)).toBe(
      true,
    );
  });

  it('does not recreate one occurrence after single lesson delete', async () => {
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

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body).toHaveLength(3);

    const target = before.body[0];
    await agent.delete(`/api/lessons/${target.id}`).expect(204);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body).toHaveLength(2);
    expect(after.body.some((l: { startUtc: string }) => l.startUtc === target.startUtc)).toBe(false);
    expect(
      after.body.every((l: { recurringScheduleId: string }) => l.recurringScheduleId === created.body.id),
    ).toBe(true);
  });

  it('deletes series from anchor lesson onward and keeps earlier occurrences', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [2, 4, 6],
        startMinutes: 540,
        academicUnits: 1,
        startDate: '2030-06-01',
        endDate: '2030-06-30',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body.length).toBeGreaterThan(4);

    const sorted = [...before.body].sort((a: { startUtc: string }, b: { startUtc: string }) =>
      a.startUtc.localeCompare(b.startUtc),
    );
    const anchorIdx = Math.floor(sorted.length / 2);
    const anchor = sorted[anchorIdx];
    const keepBefore = sorted.slice(0, anchorIdx);
    const dropFrom = sorted.slice(anchorIdx);

    await agent
      .delete(`/api/recurring-schedules/${created.body.id}?fromLessonId=${anchor.id}`)
      .expect(204);

    expect((await agent.get('/api/recurring-schedules').expect(200)).body).toHaveLength(0);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body).toHaveLength(keepBefore.length);
    for (const lesson of keepBefore) {
      expect(after.body.some((l: { id: string }) => l.id === lesson.id)).toBe(true);
    }
    for (const lesson of dropFrom) {
      expect(after.body.some((l: { id: string }) => l.id === lesson.id)).toBe(false);
    }
  });
});
