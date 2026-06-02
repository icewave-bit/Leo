import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('lesson balance', () => {
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

  it('auto-completes past planned lesson and deducts lessons prepaid', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', balanceKind: 'lessons', prepaid: 5, debt: 0 })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    const list = await agent.get('/api/lessons').query(weekQuery()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].status).toBe('completed');
    expect(list.body[0].balanceCharged).toBe(true);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(4);
  });

  it('reverses charge when status changes from completed', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', balanceKind: 'lessons', prepaid: 3, debt: 0 })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(3);
  });

  it('delete with restoreBalance refunds charge', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', balanceKind: 'lessons', prepaid: 2, debt: 0 })
      .expect(201);

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query(weekQuery()).expect(200);

    await agent
      .delete(`/api/lessons/${lesson.body.id}?restoreBalance=true`)
      .expect(204);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].prepaid).toBe(2);
  });
});
