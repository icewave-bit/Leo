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

  it('lists money replenishments for taxes', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Money Top',
        hue: 210,
        balanceKind: 'money',
        prepaid: 0,
        debt: 0,
        rate: 40,
        currency: 'EUR',
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: 120 }).expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBe(1);
    expect(list.body[0].balanceKind).toBe('money');
    expect(list.body[0].sourceAmount).toBe(120);
    expect(list.body[0].amount).toBe(120);
    expect(list.body[0].amountByn).toBe(390);
  });

  it('lists lesson paid as taxable income when tutor marks lesson paid', async () => {
    const { agent } = await registerTutor(app);
    const RATE = 25;

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Lesson Payer',
        hue: 220,
        balanceKind: 'money',
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        rate: RATE,
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query({
      from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ paid: true }).expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBe(1);
    expect(list.body[0].amount).toBe(RATE);
    expect(list.body[0].currency).toBe('EUR');
    expect(list.body[0].amountByn).toBe(RATE * 3.25);
  });

  it('does not double-count lesson paid settled from prepaid top-up', async () => {
    const { agent } = await registerTutor(app);
    const RATE = 30;

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Top-up Payer',
        hue: 225,
        balanceKind: 'money',
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        rate: RATE,
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId, startUtc, durationMin: 60 })
      .expect(201);

    await agent.get('/api/lessons').query({
      from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    await agent.patch(`/api/students/${studentId}`).send({ prepaid: RATE }).expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBe(1);
    expect(list.body[0].amount).toBe(RATE);
  });

  it('creates manual tax entry without changing balance or payments journal', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Manual Tax',
        hue: 208,
        balanceKind: 'money',
        currency: 'EUR',
        prepaid: 40,
        debt: 0,
        rate: 50,
        isGroup: false,
        members: [],
      })
      .expect(201);
    const studentId = studentRes.body.id as string;

    const created = await agent
      .post('/api/taxes')
      .send({
        studentId,
        receivedOn: '2026-03-05',
        currency: 'EUR',
        amount: 75,
      })
      .expect(201);

    expect(created.body.amount).toBe(75);
    expect(created.body.currency).toBe('EUR');
    expect(created.body.replenishmentDate).toBe('2026-03-05');
    expect(created.body.amountByn).toBe(75 * 3.25);

    const studentAfter = await agent.get(`/api/students/${studentId}`).expect(200);
    expect(studentAfter.body.prepaid).toBe(40);

    const list = await agent
      .get(`/api/taxes?month=2026-03&studentId=${studentId}`)
      .expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].movementId).toBe(created.body.movementId);

    const from = '2026-03-01T00:00:00.000Z';
    const to = '2026-04-01T00:00:00.000Z';
    const movements = await agent
      .get(`/api/balance-movements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&studentId=${studentId}`)
      .expect(200);
    expect(movements.body.some((m: { id: string }) => m.id === created.body.movementId)).toBe(
      false,
    );
  });

  it('excludes deleted replenishment from tax list permanently', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Deleted Tax Row',
        hue: 212,
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
      .send({ prepaid: 80, receivedOn: '2026-02-10' })
      .expect(200);

    const list = await agent
      .get(`/api/taxes?month=2026-02&studentId=${studentId}`)
      .expect(200);
    expect(list.body.length).toBe(1);
    const movementId = list.body[0].movementId as string;

    await agent.delete(`/api/taxes/${movementId}`).expect(204);

    const afterDelete = await agent
      .get(`/api/taxes?month=2026-02&studentId=${studentId}`)
      .expect(200);
    expect(afterDelete.body.length).toBe(0);

    const afterReload = await agent
      .get(`/api/taxes?month=2026-02&studentId=${studentId}`)
      .expect(200);
    expect(afterReload.body.length).toBe(0);
  });

  it('excludes manual balance corrections (prepaid + debt patch)', async () => {
    const { agent } = await registerTutor(app);

    const studentRes = await agent
      .post('/api/students')
      .send({
        name: 'Initial Balance',
        hue: 215,
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
      .send({ balanceKind: 'money', prepaid: 100, debt: 0 })
      .expect(200);

    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const list = await agent
      .get(`/api/taxes?month=${month}&studentId=${studentId}`)
      .expect(200);

    expect(list.body.length).toBe(0);
  });
});
