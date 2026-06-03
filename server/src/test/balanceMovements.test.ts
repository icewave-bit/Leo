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
});
