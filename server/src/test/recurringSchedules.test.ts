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

  it('moves remaining series lessons and template time without changing weekday', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-25',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body).toHaveLength(4);

    const target = before.body[0];
    await agent
      .patch(`/api/lessons/${target.id}`)
      .send({ startUtc: '2030-06-04T12:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body).toHaveLength(4);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-04T12:00:00.000Z',
      '2030-06-11T12:00:00.000Z',
      '2030-06-18T12:00:00.000Z',
      '2030-06-25T12:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      startMinutes: 720,
      weekdays: [1],
    });
  });

  it('shifts remaining series lessons and template weekday by calendar days', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-25',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const target = before.body[0];

    await agent
      .patch(`/api/lessons/${target.id}`)
      .send({ startUtc: '2030-06-06T10:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-06T10:00:00.000Z',
      '2030-06-13T10:00:00.000Z',
      '2030-06-20T10:00:00.000Z',
      '2030-06-27T10:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      weekdays: [3],
      startMinutes: 600,
      startDate: '2030-06-06',
      endDate: '2030-06-27',
    });
  });

  it('keeps biweekly phase when the series is moved from the first occurrence', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        intervalWeeks: 2,
        startDate: '2030-06-04',
        endDate: '2030-07-16',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-20T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-04T10:00:00.000Z',
      '2030-06-18T10:00:00.000Z',
      '2030-07-02T10:00:00.000Z',
      '2030-07-16T10:00:00.000Z',
    ]);

    await agent
      .patch(`/api/lessons/${before.body[0].id}`)
      .send({ startUtc: '2030-06-06T10:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-06T10:00:00.000Z',
      '2030-06-20T10:00:00.000Z',
      '2030-07-04T10:00:00.000Z',
      '2030-07-18T10:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      weekdays: [3],
      intervalWeeks: 2,
      startDate: '2030-06-06',
      endDate: '2030-07-18',
    });
  });

  it('moves from a middle occurrence onward and keeps earlier lessons', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-25',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const anchor = before.body[1];

    await agent
      .patch(`/api/lessons/${anchor.id}`)
      .send({ startUtc: '2030-06-13T10:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-04T10:00:00.000Z',
      '2030-06-13T10:00:00.000Z',
      '2030-06-20T10:00:00.000Z',
      '2030-06-27T10:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      weekdays: [3],
      startDate: '2030-06-13',
      endDate: '2030-06-27',
    });
  });

  it('does not change other lessons or the series template without moveSeries', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-25',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const target = before.body[0];
    const newStartUtc = '2030-06-04T12:00:00.000Z';

    await agent.patch(`/api/lessons/${target.id}`).send({ startUtc: newStartUtc }).expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body).toHaveLength(4);
    expect(after.body.some((l: { startUtc: string }) => l.startUtc === target.startUtc)).toBe(false);
    expect(
      after.body.some((l: { id: string; startUtc: string }) => l.id === target.id && l.startUtc === newStartUtc),
    ).toBe(true);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc).sort()).toEqual(
      [newStartUtc, '2030-06-11T10:00:00.000Z', '2030-06-18T10:00:00.000Z', '2030-06-25T10:00:00.000Z'].sort(),
    );

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      weekdays: [1],
      startMinutes: 600,
      startDate: '2030-06-04',
    });
  });

  it('does not rematerialize a deleted occurrence after moving the series', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 600,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-25',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const deleted = before.body[2];
    await agent.delete(`/api/lessons/${deleted.id}`).expect(204);

    await agent
      .patch(`/api/lessons/${before.body[0].id}`)
      .send({ startUtc: '2030-06-06T10:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-06T10:00:00.000Z',
      '2030-06-13T10:00:00.000Z',
      '2030-06-27T10:00:00.000Z',
    ]);
    expect(after.body.some((l: { startUtc: string }) => l.startUtc === '2030-06-20T10:00:00.000Z')).toBe(
      false,
    );
  });

  it('rejects moveSeries on a lesson that is not in a series', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const lesson = await agent
      .post('/api/lessons')
      .send({
        studentId,
        startUtc: '2030-06-04T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    const res = await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: '2030-06-05T10:00:00.000Z', moveSeries: true })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('splits one weekday out of a multi-weekday series and leaves the others', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [0, 3],
        startMinutes: 360,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-27',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const thursday = before.body.find(
      (l: { startUtc: string }) => l.startUtc === '2030-06-06T06:00:00.000Z',
    );
    expect(thursday).toBeDefined();

    const patched = await agent
      .patch(`/api/lessons/${thursday.id}`)
      .send({ startUtc: '2030-06-06T08:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-03T06:00:00.000Z',
      '2030-06-06T08:00:00.000Z',
      '2030-06-10T06:00:00.000Z',
      '2030-06-13T08:00:00.000Z',
      '2030-06-17T06:00:00.000Z',
      '2030-06-20T08:00:00.000Z',
      '2030-06-24T06:00:00.000Z',
      '2030-06-27T08:00:00.000Z',
    ]);

    const mondayLessons = after.body.filter((l: { startUtc: string }) =>
      l.startUtc.endsWith('T06:00:00.000Z'),
    );
    const thursdayLessons = after.body.filter((l: { startUtc: string }) =>
      l.startUtc.endsWith('T08:00:00.000Z'),
    );
    expect(mondayLessons.every((l: { recurringScheduleId: string }) => l.recurringScheduleId === created.body.id)).toBe(
      true,
    );
    expect(
      thursdayLessons.every((l: { recurringScheduleId: string }) => l.recurringScheduleId === patched.body.recurringScheduleId),
    ).toBe(true);
    expect(patched.body.recurringScheduleId).not.toBe(created.body.id);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body).toHaveLength(2);
    expect(schedules.body.find((s: { id: string }) => s.id === created.body.id)).toMatchObject({
      weekdays: [0],
      startMinutes: 360,
      startDate: '2030-06-03',
    });
    expect(
      schedules.body.find((s: { id: string }) => s.id === patched.body.recurringScheduleId),
    ).toMatchObject({
      weekdays: [3],
      startMinutes: 480,
      startDate: '2030-06-06',
      endDate: '2030-06-27',
    });
  });

  it('keeps earlier occurrences of the split weekday on the original series', async () => {
    const { agent } = await registerTutor(app);
    const studentId = await createStudent(agent);

    const created = await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [0, 3],
        startMinutes: 360,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-27',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const laterThursday = before.body.find(
      (l: { startUtc: string }) => l.startUtc === '2030-06-13T06:00:00.000Z',
    );
    expect(laterThursday).toBeDefined();

    await agent
      .patch(`/api/lessons/${laterThursday.id}`)
      .send({ startUtc: '2030-06-13T08:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-03T06:00:00.000Z',
      '2030-06-06T06:00:00.000Z',
      '2030-06-10T06:00:00.000Z',
      '2030-06-13T08:00:00.000Z',
      '2030-06-17T06:00:00.000Z',
      '2030-06-20T08:00:00.000Z',
      '2030-06-24T06:00:00.000Z',
      '2030-06-27T08:00:00.000Z',
    ]);
    const keptThursday = after.body.find(
      (l: { startUtc: string }) => l.startUtc === '2030-06-06T06:00:00.000Z',
    );
    expect(keptThursday.recurringScheduleId).toBe(created.body.id);
  });

  it('splits only the dragged weekday when it also changes day', async () => {
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
        endDate: '2030-06-19',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    const monday = before.body.find((l: { startUtc: string }) => l.startUtc === '2030-06-03T10:00:00.000Z');
    expect(monday).toBeDefined();

    await agent
      .patch(`/api/lessons/${monday.id}`)
      .send({ startUtc: '2030-06-04T10:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-04T10:00:00.000Z',
      '2030-06-05T10:00:00.000Z',
      '2030-06-11T10:00:00.000Z',
      '2030-06-12T10:00:00.000Z',
      '2030-06-18T10:00:00.000Z',
      '2030-06-19T10:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body).toHaveLength(2);
    expect(schedules.body.find((s: { id: string }) => s.id === created.body.id)).toMatchObject({
      weekdays: [2],
      startMinutes: 600,
      startDate: '2030-06-03',
    });
    expect(schedules.body.find((s: { weekdays: number[] }) => s.weekdays[0] === 1)).toMatchObject({
      weekdays: [1],
      startMinutes: 600,
      startDate: '2030-06-04',
    });
  });

  it('keeps a Moscow overnight slot on the same local weekday after a series move', async () => {
    const { agent } = await registerTutor(app, { timezone: 'Europe/Moscow' });
    const studentId = await createStudent(agent);

    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId,
        weekdays: [1],
        startMinutes: 60,
        academicUnits: 1,
        startDate: '2030-06-04',
        endDate: '2030-06-18',
      })
      .expect(201);

    const range = { from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' };
    const before = await agent.get('/api/lessons').query(range).expect(200);
    expect(before.body[0].startUtc).toBe('2030-06-03T22:00:00.000Z');

    await agent
      .patch(`/api/lessons/${before.body[0].id}`)
      .send({ startUtc: '2030-06-03T23:00:00.000Z', moveSeries: true })
      .expect(200);

    const after = await agent.get('/api/lessons').query(range).expect(200);
    expect(after.body.map((l: { startUtc: string }) => l.startUtc)).toEqual([
      '2030-06-03T23:00:00.000Z',
      '2030-06-10T23:00:00.000Z',
      '2030-06-17T23:00:00.000Z',
    ]);

    const schedules = await agent.get('/api/recurring-schedules').expect(200);
    expect(schedules.body[0]).toMatchObject({
      weekdays: [1],
      startMinutes: 120,
      startDate: '2030-06-04',
    });
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
