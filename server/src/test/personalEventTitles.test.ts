import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('personal event titles', () => {
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

  it('returns distinct titles most recently used first and hides other tutors', async () => {
    const { agent } = await registerTutor(app);
    const other = await registerTutor(app);

    const group = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Спорт', color: '#112233' })
      .expect(201);
    const otherList = await agent
      .post('/api/personal-event-groups')
      .send({ name: 'Работа', color: '#334455' })
      .expect(201);
    const otherGroup = await other.agent
      .post('/api/personal-event-groups')
      .send({ name: 'Чужое', color: '#445566' })
      .expect(201);

    await agent
      .post('/api/personal-events')
      .send({
        groupId: group.body.id,
        title: 'Зал',
        startUtc: '2026-10-01T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    await agent
      .post('/api/personal-events')
      .send({
        groupId: group.body.id,
        title: 'Спортзал',
        startUtc: '2026-10-02T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    await agent
      .post('/api/personal-events')
      .send({
        groupId: group.body.id,
        title: 'спортзал',
        startUtc: '2026-10-03T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    await agent
      .post('/api/recurring-personal-schedules')
      .send({
        groupId: group.body.id,
        title: 'Пробежка',
        weekdays: [1],
        startMinutes: 8 * 60,
        durationMin: 30,
        startDate: '2026-11-02',
        endDate: '2026-11-02',
      })
      .expect(201);

    await agent
      .post('/api/personal-events')
      .send({
        groupId: otherList.body.id,
        title: 'Созвон',
        startUtc: '2026-10-05T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    await other.agent
      .post('/api/personal-events')
      .send({
        groupId: otherGroup.body.id,
        title: 'Секрет',
        startUtc: '2026-10-04T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    const missing = await agent.get('/api/personal-events/titles').expect(400);
    expect(missing.body.error.code).toBe('VALIDATION');

    const titles = await agent.get('/api/personal-events/titles').query({ groupId: group.body.id }).expect(200);
    expect(titles.body).toContain('спортзал');
    expect(titles.body).toContain('Зал');
    expect(titles.body).toContain('Пробежка');
    expect(titles.body.filter((title: string) => title.toLocaleLowerCase() === 'спортзал')).toHaveLength(1);
    expect(titles.body).not.toContain('Секрет');
    expect(titles.body).not.toContain('Созвон');
    expect(titles.body.indexOf('спортзал')).toBeLessThan(titles.body.indexOf('Зал'));

    const work = await agent.get('/api/personal-events/titles').query({ groupId: otherList.body.id }).expect(200);
    expect(work.body).toEqual(['Созвон']);

    await agent.get('/api/personal-events/titles').query({ groupId: otherGroup.body.id }).expect(404);
  });
});
