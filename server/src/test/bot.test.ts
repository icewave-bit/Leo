import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig, resetConfigCache } from '../config.js';
import { query } from '../db.js';
import { ensureDefaultPersonalEventGroups } from '../personalEventGroups.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

function botToken(): string {
  return loadConfig().BOT_API_TOKEN;
}

const defaultTelegramNotify = {
  enabled: true,
  leadMinutes: 30,
  silent: false,
  lessons: true,
  personal: false,
  personalGroupIds: [],
};

async function linkTelegram(agent: request.Agent, app: Express, telegramUserId: string) {
  const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
  await request(app)
    .post('/api/bot/link')
    .set('Authorization', `Bearer ${botToken()}`)
    .send({ code: codeRes.body.code, telegramUserId })
    .expect(200);
  return telegramUserId;
}

describe('telegram bot api', () => {
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

  it('rejects bot routes without bearer token', async () => {
    await request(app).get('/api/bot/me').expect(401);
    await request(app)
      .get('/api/bot/me')
      .set('Authorization', 'Bearer wrong-token-xxxxxxxx')
      .set('X-Telegram-User-Id', '123')
      .expect(401);
  });

  it('link-code requires session; bot link + me work after linking', async () => {
    const { agent } = await registerTutor(app, { name: 'Bot Tutor' });

    await request(app).post('/api/auth/telegram/link-code').expect(401);

    const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
    expect(codeRes.body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(codeRes.body.expiresAt).toBeTruthy();

    const telegramUserId = '424242';
    const linkRes = await request(app)
      .post('/api/bot/link')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({
        code: codeRes.body.code,
        telegramUserId,
        telegramUsername: 'bot_tutor',
      })
      .expect(200);

    expect(linkRes.body.tutor.telegramLinked).toBe(true);
    expect(linkRes.body.tutor.telegramUsername).toBe('bot_tutor');
    expect(linkRes.body.tutor.telegramNotify).toEqual(defaultTelegramNotify);

    const me = await request(app)
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(me.body.tutor.name).toBe('Bot Tutor');
    expect(me.body.tutor.telegramNotify).toEqual(defaultTelegramNotify);

    const today = await request(app)
      .get('/api/bot/today')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(today.body.lessons).toEqual([]);
    expect(today.body.timezone).toBe('UTC');

    const week = await request(app)
      .get('/api/bot/week')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(week.body.lessons).toEqual([]);

    const students = await request(app)
      .get('/api/bot/students')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(students.body.students).toEqual([]);

    const debt = await request(app)
      .get('/api/bot/debt')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(debt.body.students).toEqual([]);
  });

  it('returns TELEGRAM_NOT_LINKED when telegram id is unknown', async () => {
    const res = await request(app)
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', '999999')
      .expect(403);
    expect(res.body.error.code).toBe('TELEGRAM_NOT_LINKED');
  });

  it('rejects expired link codes', async () => {
    const { agent, tutorId } = await registerTutor(app);
    const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);

    await query(
      `UPDATE telegram_link_codes SET expires_at = now() - interval '1 minute' WHERE code = $1`,
      [codeRes.body.code],
    );

    const res = await request(app)
      .post('/api/bot/link')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ code: codeRes.body.code, telegramUserId: '111' })
      .expect(400);
    expect(res.body.error.message).toMatch(/expired/i);

    const still = await query<{ id: string }>(
      'SELECT id FROM tutors WHERE id = $1 AND telegram_user_id IS NULL',
      [tutorId],
    );
    expect(still.rows).toHaveLength(1);
  });

  it('session me reflects telegram link; unlink clears it', async () => {
    const { agent } = await registerTutor(app);
    const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
    await request(app)
      .post('/api/bot/link')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ code: codeRes.body.code, telegramUserId: '777', telegramUsername: 'linked' })
      .expect(200);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.tutor.telegramLinked).toBe(true);
    expect(me.body.tutor.telegramUsername).toBe('linked');

    const unlinked = await agent.post('/api/auth/telegram/unlink').expect(200);
    expect(unlinked.body.tutor.telegramLinked).toBe(false);
    expect(unlinked.body.tutor.telegramUsername).toBeNull();
    expect(unlinked.body.tutor.telegramNotify).toEqual(defaultTelegramNotify);
  });

  it('patch me updates telegramNotify and bot me reflects changes', async () => {
    const { agent } = await registerTutor(app);
    const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
    const telegramUserId = '888001';
    await request(app)
      .post('/api/bot/link')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ code: codeRes.body.code, telegramUserId })
      .expect(200);

    const patched = await agent
      .patch('/api/auth/me')
      .send({
        telegramNotify: {
          enabled: false,
          leadMinutes: 15,
          silent: true,
          personal: true,
        },
      })
      .expect(200);
    expect(patched.body.tutor.telegramNotify).toEqual({
      enabled: false,
      leadMinutes: 15,
      silent: true,
      lessons: true,
      personal: true,
      personalGroupIds: [],
    });

    const botMe = await request(app)
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(botMe.body.tutor.telegramNotify).toEqual(patched.body.tutor.telegramNotify);
  });

  it('rejects invalid telegramNotify leadMinutes', async () => {
    const { agent } = await registerTutor(app);
    await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { leadMinutes: 7 } })
      .expect(400);
  });

  it('GET /api/bot/personal-events/today returns empty events by default', async () => {
    const { agent } = await registerTutor(app);
    const telegramUserId = await linkTelegram(agent, app, '555001');

    const res = await request(app)
      .get('/api/bot/personal-events/today')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);

    expect(res.body.events).toEqual([]);
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.from).toBeTruthy();
    expect(res.body.to).toBeTruthy();
  });

  it('GET /api/bot/personal-events/today returns seeded event with groupName', async () => {
    const { tutorId, agent } = await registerTutor(app, { timezone: 'UTC' });
    const telegramUserId = await linkTelegram(agent, app, '555002');
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const workGroup = groups.find((g) => g.name === 'Работа')!;

    const startUtc = new Date();
    startUtc.setUTCHours(14, 0, 0, 0);

    await query(
      `INSERT INTO personal_events (tutor_id, group_id, title, start_utc, duration_min)
       VALUES ($1, $2, $3, $4, 60)`,
      [tutorId, workGroup.id, 'Встреча', startUtc.toISOString()],
    );

    const res = await request(app)
      .get('/api/bot/personal-events/today')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);

    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      groupId: workGroup.id,
      groupName: 'Работа',
      title: 'Встреча',
      startUtc: startUtc.toISOString(),
      durationMin: 60,
    });
    expect(res.body.events[0].id).toBeTruthy();
  });

  it('GET /api/bot/personal-events/today materializes recurring personal schedule', async () => {
    const { tutorId, agent } = await registerTutor(app, { timezone: 'UTC' });
    const telegramUserId = await linkTelegram(agent, app, '555003');
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const group = groups[0]!;

    const now = new Date();
    const weekday = (now.getUTCDay() + 6) % 7;
    const today = now.toISOString().slice(0, 10);

    await query(
      `INSERT INTO recurring_personal_schedules (
         tutor_id, group_id, title, weekdays, start_minutes, duration_min, start_date, active
       ) VALUES ($1, $2, $3, $4, $5, 45, $6, true)`,
      [tutorId, group.id, 'Еженедельная тренировка', [weekday], 10 * 60, today],
    );

    const res = await request(app)
      .get('/api/bot/personal-events/today')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);

    expect(res.body.events.length).toBeGreaterThanOrEqual(1);
    const match = res.body.events.find(
      (e: { title: string; groupName: string }) =>
        e.title === 'Еженедельная тренировка' && e.groupName === group.name,
    );
    expect(match).toBeTruthy();
    expect(match.durationMin).toBe(45);
  });

  it('PATCH personalGroupIds saved and reflected on bot me', async () => {
    const { tutorId, agent } = await registerTutor(app);
    const telegramUserId = await linkTelegram(agent, app, '555004');
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const workGroup = groups.find((g) => g.name === 'Работа')!;
    const familyGroup = groups.find((g) => g.name === 'Семья')!;

    const patched = await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { personalGroupIds: [workGroup.id, familyGroup.id] } })
      .expect(200);
    expect(patched.body.tutor.telegramNotify.personalGroupIds).toEqual([
      workGroup.id,
      familyGroup.id,
    ]);

    const botMe = await request(app)
      .get('/api/bot/me')
      .set('Authorization', `Bearer ${botToken()}`)
      .set('X-Telegram-User-Id', telegramUserId)
      .expect(200);
    expect(botMe.body.tutor.telegramNotify.personalGroupIds).toEqual([
      workGroup.id,
      familyGroup.id,
    ]);
  });

  it('PATCH personalGroupIds rejects foreign group UUID', async () => {
    const { agent, tutorId } = await registerTutor(app);
    await linkTelegram(agent, app, '555005');
    await ensureDefaultPersonalEventGroups(tutorId);

    const other = await registerTutor(app);
    const otherGroups = await ensureDefaultPersonalEventGroups(other.tutorId);

    await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { personalGroupIds: [otherGroups[0]!.id] } })
      .expect(400);
  });

  it('PATCH personalGroupIds rejects unknown UUID', async () => {
    const { agent, tutorId } = await registerTutor(app);
    await linkTelegram(agent, app, '555006');
    await ensureDefaultPersonalEventGroups(tutorId);

    await agent
      .patch('/api/auth/me')
      .send({
        telegramNotify: { personalGroupIds: ['00000000-0000-4000-8000-000000000001'] },
      })
      .expect(400);
  });
});
