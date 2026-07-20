import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig, resetConfigCache } from '../config.js';
import { query } from '../db.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

function botToken(): string {
  return loadConfig().BOT_API_TOKEN;
}

async function createStudentWithTelegram(
  agent: request.Agent,
  username: string,
  overrides?: Partial<{ name: string; prepaid: number }>,
) {
  const res = await agent
    .post('/api/students')
    .send({
      name: overrides?.name ?? 'Student One',
      hue: 200,
      currency: 'EUR',
      prepaid: overrides?.prepaid ?? 50,
      debt: 0,
      telegramUsername: username,
    })
    .expect(201);
  return res.body as { id: string; telegramUsername: string; telegramLinked: boolean };
}

describe('student telegram bot api', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
    resetConfigCache();
    app = await createApp();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('register binds telegram user id by username; unknown username 404', async () => {
    const { agent } = await registerTutor(app);
    await createStudentWithTelegram(agent, 'alice_student');

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '9001', telegramUsername: 'unknown_user' })
      .expect(404);

    const linked = await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '9001', telegramUsername: 'Alice_Student' })
      .expect(200);

    expect(linked.body.student.name).toBe('Student One');
    expect(linked.body.student.telegramUsername).toBe('Alice_Student');
    expect(linked.body.student.balance.prepaid).toBe(50);

    const me = await request(app)
      .get('/api/bot/student/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '9001')
      .expect(200);
    expect(me.body.student.name).toBe('Student One');
  });

  it('rejects register when telegram id is a linked tutor', async () => {
    const { agent } = await registerTutor(app);
    await createStudentWithTelegram(agent, 'bob_student');

    const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
    await request(app)
      .post('/api/bot/link')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ code: codeRes.body.code, telegramUserId: '7777' })
      .expect(200);

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '7777', telegramUsername: 'bob_student' })
      .expect(409);
  });

  it('student week returns only that student lessons; balance and open-slots work', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudentWithTelegram(agent, 'carol_stu');
    const other = await createStudentWithTelegram(agent, 'other_stu', { name: 'Other' });

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '8001', telegramUsername: 'carol_stu' })
      .expect(200);

    // Monday 10:00 UTC in week of 2026-07-20
    await agent
      .post('/api/lessons')
      .send({
        studentId: student.id,
        startUtc: '2026-07-20T10:00:00.000Z',
        durationMin: 60,
        status: 'planned',
        type: 'solo',
      })
      .expect(201);
    await agent
      .post('/api/lessons')
      .send({
        studentId: other.id,
        startUtc: '2026-07-20T12:00:00.000Z',
        durationMin: 60,
        status: 'planned',
        type: 'solo',
      })
      .expect(201);

    // Freeze "now" by using real clock — open-slots/week use Date.now().
    // Patch lessons into whatever current week is instead.
    await query('DELETE FROM lessons WHERE tutor_id = $1', [tutorId]);
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(10, 0, 0, 0);
    if (start.getTime() < now.getTime()) {
      start.setUTCDate(start.getUTCDate() + 1);
    }

    await agent
      .post('/api/lessons')
      .send({
        studentId: student.id,
        startUtc: start.toISOString(),
        durationMin: 60,
        status: 'planned',
        type: 'solo',
      })
      .expect(201);
    await agent
      .post('/api/lessons')
      .send({
        studentId: other.id,
        startUtc: new Date(start.getTime() + 2 * 3600_000).toISOString(),
        durationMin: 60,
        status: 'planned',
        type: 'solo',
      })
      .expect(201);

    const week = await request(app)
      .get('/api/bot/student/week')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '8001')
      .expect(200);

    expect(week.body.lessons).toHaveLength(1);
    expect(week.body.lessons[0].studentId).toBe(student.id);

    const balance = await request(app)
      .get('/api/bot/student/balance')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '8001')
      .expect(200);
    expect(balance.body.balance.prepaid).toBe(50);

    const slots = await request(app)
      .get('/api/bot/student/open-slots')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '8001')
      .expect(200);
    expect(Array.isArray(slots.body.days)).toBe(true);
    expect(slots.body.timezone).toBe('UTC');
  });

  it('patch student telegramUsername and unlinkTelegram', async () => {
    const { agent } = await registerTutor(app);
    const student = await createStudentWithTelegram(agent, 'dave_stu');

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '8100', telegramUsername: 'dave_stu' })
      .expect(200);

    const patched = await agent
      .patch(`/api/students/${student.id}`)
      .send({ telegramUsername: 'dave_new' })
      .expect(200);
    expect(patched.body.telegramUsername).toBe('dave_new');
    expect(patched.body.telegramLinked).toBe(true);

    const unlinked = await agent
      .patch(`/api/students/${student.id}`)
      .send({ unlinkTelegram: true })
      .expect(200);
    expect(unlinked.body.telegramLinked).toBe(false);
    expect(unlinked.body.telegramUsername).toBeNull();

    await request(app)
      .get('/api/bot/student/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '8100')
      .expect(403);
  });

  it('tutor bot routes reject student telegram ids', async () => {
    const { agent } = await registerTutor(app);
    await createStudentWithTelegram(agent, 'erin_stu');
    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '8200', telegramUsername: 'erin_stu' })
      .expect(200);

    await request(app)
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '8200')
      .expect(403);
  });
});
