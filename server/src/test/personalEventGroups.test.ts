import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('personal event groups default duration', () => {
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

  it('omitted defaultDurationMin is 60 on create and list', async () => {
    const { agent } = await registerTutor(app);

    const created = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Спорт', color: '#112233' })
      .expect(201);

    expect(created.body.defaultDurationMin).toBe(60);

    const list = await agent.get('/api/personal-event-groups').expect(200);
    const createdGroup = list.body.find((group: { id: string }) => group.id === created.body.id);
    expect(createdGroup.defaultDurationMin).toBe(60);
    expect(list.body.every((group: { defaultDurationMin: number }) => typeof group.defaultDurationMin === 'number')).toBe(
      true,
    );
  });

  it('persists a valid defaultDurationMin on create and on a duration-only patch', async () => {
    const { agent } = await registerTutor(app);

    const created = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Спорт', color: '#112233', defaultDurationMin: 90 })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Спорт',
      color: '#112233',
      defaultDurationMin: 90,
    });

    const patched = await agent
      .patch(`/api/personal-event-groups/${created.body.id}`)
      .send({ defaultDurationMin: 45 })
      .expect(200);

    expect(patched.body).toMatchObject({
      id: created.body.id,
      name: 'Спорт',
      color: '#112233',
      defaultDurationMin: 45,
    });

    const list = await agent.get('/api/personal-event-groups').expect(200);
    const stored = list.body.find((group: { id: string }) => group.id === created.body.id);
    expect(stored.defaultDurationMin).toBe(45);
  });

  it('rejects durations outside 15–480 and non-integers', async () => {
    const { agent } = await registerTutor(app);

    for (const defaultDurationMin of [14, 481, 30.5]) {
      const res = await agent
        .post('/api/personal-event-groups')
        .send({ name: 'Спорт', color: '#112233', defaultDurationMin })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }

    const created = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Спорт', color: '#112233' })
      .expect(201);

    for (const defaultDurationMin of [14, 481, 30.5]) {
      const res = await agent
        .patch(`/api/personal-event-groups/${created.body.id}`)
        .send({ defaultDurationMin })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }

    const unchanged = await agent.get('/api/personal-event-groups').expect(200);
    const stored = unchanged.body.find((group: { id: string }) => group.id === created.body.id);
    expect(stored.defaultDurationMin).toBe(60);
  });

  it('does not rewrite an existing personal event when the group default changes', async () => {
    const { agent } = await registerTutor(app);
    const created = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Спорт', color: '#112233', defaultDurationMin: 60 })
      .expect(201);

    const startUtc = new Date('2026-10-06T10:00:00.000Z').toISOString();
    const event = await agent
      .post('/api/personal-events')
      .send({
        groupId: created.body.id,
        title: 'Зал',
        startUtc,
        durationMin: 45,
      })
      .expect(201);

    expect(event.body.durationMin).toBe(45);

    await agent
      .patch(`/api/personal-event-groups/${created.body.id}`)
      .send({ defaultDurationMin: 120 })
      .expect(200);

    const listed = await agent
      .get('/api/personal-events')
      .query({
        from: '2026-10-06T00:00:00.000Z',
        to: '2026-10-07T00:00:00.000Z',
      })
      .expect(200);

    const stored = listed.body.find((row: { id: string }) => row.id === event.body.id);
    expect(stored.durationMin).toBe(45);
  });
});
