import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { resetConfigCache } from '../config.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

describe('auth', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
    app = await createApp();
  });

  afterEach(() => {
    resetConfigCache();
    process.env.COOKIE_SECURE = 'false';
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('register sets Secure cookie when COOKIE_SECURE and X-Forwarded-Proto is https', async () => {
    resetConfigCache();
    process.env.COOKIE_SECURE = 'true';
    const secureApp = await createApp();
    const email = `proxy-${crypto.randomUUID()}@test.com`;
    const reg = await request(secureApp)
      .post('/api/auth/register')
      .set('X-Forwarded-Proto', 'https')
      .send({ email, password: 'password123', name: 'Proxy Test' })
      .expect(201);
    expect(reg.headers['set-cookie']).toBeDefined();
    expect(reg.headers['set-cookie']![0]).toMatch(/Secure/i);
  });

  it('register success + sets session', async () => {
    const email = `reg-${crypto.randomUUID()}@test.com`;
    const agent = request.agent(app);
    const reg = await agent
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'Reg Test' })
      .expect(201);
    expect(reg.headers['set-cookie']).toBeDefined();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.email).toBe(email);
  });

  it('duplicate email → 409 EMAIL_TAKEN', async () => {
    const email = `dup-${crypto.randomUUID()}@test.com`;
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'A' })
      .expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'B' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('weak/invalid input → 400 VALIDATION', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-email', password: 'short', name: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details).toBeDefined();
  });

  it('login success/failure', async () => {
    const email = `login-${crypto.randomUUID()}@test.com`;
    const password = 'password123';
    await request(app)
      .post('/api/auth/register')
      .send({ email, password, name: 'Login Test' })
      .expect(201);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password }).expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong' })
      .expect(401);
  });

  it('patch me updates tax settings', async () => {
    const { agent } = await registerTutor(app);
    const patched = await agent
      .patch('/api/auth/me')
      .send({ taxRatePercent: 13, taxDisplayCurrency: 'none' })
      .expect(200);
    expect(patched.body.tutor.taxRatePercent).toBe(13);
    expect(patched.body.tutor.taxDisplayCurrency).toBe('none');
  });

  it('patch me updates defaultReplenishBalanceKind', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.defaultReplenishBalanceKind).toBe('money');

    const patched = await agent
      .patch('/api/auth/me')
      .send({ defaultReplenishBalanceKind: 'lessons' })
      .expect(200);
    expect(patched.body.tutor.defaultReplenishBalanceKind).toBe('lessons');
  });

  it('patch me updates hiddenWeekdays', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.hiddenWeekdays).toEqual([]);

    const patched = await agent
      .patch('/api/auth/me')
      .send({ hiddenWeekdays: [5, 6] })
      .expect(200);
    expect(patched.body.tutor.hiddenWeekdays).toEqual([5, 6]);

    await agent.patch('/api/auth/me').send({ hiddenWeekdays: [0, 1, 2, 3, 4, 5, 6] }).expect(400);
  });

  it('patch me updates default block hours', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.defaultBlockStartMinutes).toBe(22 * 60);
    expect(me.body.tutor.defaultBlockEndMinutes).toBe(8 * 60);

    const patched = await agent
      .patch('/api/auth/me')
      .send({ defaultBlockStartMinutes: 21 * 60, defaultBlockEndMinutes: 9 * 60 })
      .expect(200);
    expect(patched.body.tutor.defaultBlockStartMinutes).toBe(21 * 60);
    expect(patched.body.tutor.defaultBlockEndMinutes).toBe(9 * 60);
  });

  it('patch me updates personalEventOutline', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.personalEventOutline).toBe('tab');

    const patched = await agent
      .patch('/api/auth/me')
      .send({ personalEventOutline: 'dashed' })
      .expect(200);
    expect(patched.body.tutor.personalEventOutline).toBe('dashed');

    await agent.patch('/api/auth/me').send({ personalEventOutline: 'invalid' }).expect(400);
  });

  it('patch me updates weekStartsOn', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.weekStartsOn).toBe('monday');

    const patched = await agent
      .patch('/api/auth/me')
      .send({ weekStartsOn: 'sunday' })
      .expect(200);
    expect(patched.body.tutor.weekStartsOn).toBe('sunday');
  });

  it('patch me updates telegramNotify', async () => {
    const { agent } = await registerTutor(app);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.telegramNotify).toEqual({
      enabled: true,
      leadMinutes: 30,
      silent: false,
      lessons: true,
      personal: false,
      personalGroupIds: [],
    });

    const patched = await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { leadMinutes: 5, silent: true } })
      .expect(200);
    expect(patched.body.tutor.telegramNotify).toEqual({
      enabled: true,
      leadMinutes: 5,
      silent: true,
      lessons: true,
      personal: false,
      personalGroupIds: [],
    });

    await agent.patch('/api/auth/me').send({ telegramNotify: { leadMinutes: 7 } }).expect(400);
  });

  it('patch me updates telegramNotify personalGroupIds', async () => {
    const { agent, tutorId } = await registerTutor(app);
    const { ensureDefaultPersonalEventGroups } = await import('../personalEventGroups.js');
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const workGroup = groups.find((g) => g.name === 'Работа')!;

    const patched = await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { personalGroupIds: [workGroup.id] } })
      .expect(200);
    expect(patched.body.tutor.telegramNotify.personalGroupIds).toEqual([workGroup.id]);

    const cleared = await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { personalGroupIds: [] } })
      .expect(200);
    expect(cleared.body.tutor.telegramNotify.personalGroupIds).toEqual([]);
  });

  it('me with and without session; logout clears session', async () => {
    const { agent } = await registerTutor(app);
    await agent.get('/api/auth/me').expect(200);

    await request(app).get('/api/auth/me').expect(401);

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });
});
