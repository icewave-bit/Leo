import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { clearNbrbCache } from '../nbrb.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('taxes', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    clearNbrbCache();
    await setupTestDb();
    app = await createApp();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/exrates/rates/EUR')) {
          return new Response(
            JSON.stringify({
              Cur_Scale: 1,
              Cur_OfficialRate: 3.25,
            }),
            { status: 200 },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await teardownTestDb();
  });

  it('lists money replenishments with BYN conversion and updates meta', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Tax Test',
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

    await agent
      .patch(`/api/students/${studentId}`)
      .send({ prepaid: 100, receivedOn: '2026-01-15' })
      .expect(200);

    const list = await agent
      .get(`/api/taxes?month=2026-01&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const entry = list.body[0];
    expect(entry.currency).toBe('EUR');
    expect(entry.amount).toBe(100);
    expect(entry.replenishmentDate).toBe('2026-01-15');
    expect(entry.amountByn).toBe(325);
    expect(entry.taxPaid).toBe(false);

    const movementId = entry.movementId as string;

    await agent
      .patch(`/api/taxes/${movementId}`)
      .send({ receivedOn: '2026-01-20' })
      .expect(204);

    const listDate = await agent
      .get(`/api/taxes?month=2026-01&studentId=${studentId}`)
      .expect(200);
    expect(listDate.body[0].replenishmentDate).toBe('2026-01-20');

    await agent
      .patch(`/api/taxes/${movementId}`)
      .send({ taxPaid: true, comment: 'УСН 1%' })
      .expect(204);

    const list2 = await agent
      .get(`/api/taxes?month=2026-01&studentId=${studentId}`)
      .expect(200);

    expect(list2.body[0].taxPaid).toBe(true);
    expect(list2.body[0].comment).toBe('УСН 1%');
  });

  it('excludes students with excludeFromTaxes', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Hidden Tax',
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

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 50 }).expect(200);
    await agent
      .patch(`/api/students/${studentId}`)
      .send({ excludeFromTaxes: true })
      .expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);
    expect(list.body.length).toBe(0);
  });

  it('skips BYN conversion when tax display currency is none', async () => {
    const { agent } = await registerTutor(app);
    await agent.patch('/api/auth/me').send({ taxDisplayCurrency: 'none' }).expect(200);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'No BYN',
        hue: 205,
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
    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 50 }).expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body[0].amountByn).toBeNull();
    expect(list.body[0].conversionError).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists lesson replenishments as money equivalent', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Lessons Top',
        hue: 210,
        balanceKind: 'lessons',
        prepaid: 0,
        debt: 0,
        rate: 40,
        currency: 'EUR',
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 3 }).expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBe(1);
    expect(list.body[0].balanceKind).toBe('lessons');
    expect(list.body[0].sourceAmount).toBe(3);
    expect(list.body[0].amount).toBe(120);
    expect(list.body[0].amountByn).toBe(390);
  });
});
