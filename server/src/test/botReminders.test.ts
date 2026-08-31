import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { listDueReminders, markRemindersSent } from '../botReminders.js';
import { createApp } from '../app.js';
import { loadConfig, resetConfigCache } from '../config.js';
import { query } from '../db.js';
import { ensureDefaultPersonalEventGroups } from '../personalEventGroups.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

function botToken(): string {
  return loadConfig().BOT_API_TOKEN;
}

async function linkTelegram(agent: request.Agent, app: Express, telegramUserId: string) {
  const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
  await request(app)
    .post('/api/bot/link')
    .set('Authorization', `Bearer ${botToken()}`)
    .send({ code: codeRes.body.code, telegramUserId })
    .expect(200);
}

async function createStudent(agent: request.Agent, name = 'Leo') {
  const res = await agent
    .post('/api/students')
    .send({
      name,
      hue: 120,
      currency: 'EUR',
      prepaid: 0,
      debt: 0,
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    })
    .expect(201);
  return res.body as { id: string };
}

async function insertLesson(opts: {
  tutorId: string;
  studentId: string;
  startUtc: Date;
  status?: string;
}) {
  const result = await query<{ id: string }>(
    `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, status)
     VALUES ($1, $2, $3, 60, $4)
     RETURNING id`,
    [opts.tutorId, opts.studentId, opts.startUtc.toISOString(), opts.status ?? 'planned'],
  );
  return result.rows[0]!.id;
}

describe('bot due reminders', () => {
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

  it('GET /api/bot/reminders/due requires bearer and does not need telegram user id', async () => {
    await request(app).get('/api/bot/reminders/due').expect(401);

    const res = await request(app)
      .get('/api/bot/reminders/due')
      .set('Authorization', `Bearer ${botToken()}`)
      .expect(200);
    expect(res.body.reminders).toEqual([]);
  });

  it('returns planned tutor lesson inside the lead window', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424201');
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    const lessonId = await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
    });

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      kind: 'lesson',
      telegramUserId: 424201,
      role: 'tutor',
      timezone: 'UTC',
      leadMinutes: 30,
      silent: false,
      lesson: {
        id: lessonId,
        studentName: 'Leo',
        status: 'planned',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      },
    });
  });

  it('skips lessons outside the lead window', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424202');
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T14:00:00.000Z'),
    });

    expect(await listDueReminders(now)).toEqual([]);
  });

  it('includes a lesson that starts after midnight in the lead window', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424203');
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T23:50:00.000Z');
    const lessonId = await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-16T00:10:00.000Z'),
    });

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.lesson?.id).toBe(lessonId);
  });

  it('skips already sent reminders', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424204');
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    const lessonId = await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
    });

    await markRemindersSent([{ telegramUserId: 424204, kind: 'lesson', entityId: lessonId }]);
    expect(await listDueReminders(now)).toEqual([]);
  });

  it('skips tutor lessons when notifications are disabled', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424205');
    await agent.patch('/api/auth/me').send({ telegramNotify: { enabled: false } }).expect(200);
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
    });

    expect(await listDueReminders(now)).toEqual([]);
  });

  it('skips tutor lessons when lessons flag is off', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424206');
    await agent.patch('/api/auth/me').send({ telegramNotify: { lessons: false } }).expect(200);
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
    });

    expect(await listDueReminders(now)).toEqual([]);
  });

  it('uses tutor leadMinutes for the window', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424207');
    await agent.patch('/api/auth/me').send({ telegramNotify: { leadMinutes: 15 } }).expect(200);
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    const insideId = await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:12:00.000Z'),
    });
    await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:25:00.000Z'),
    });

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.lesson?.id).toBe(insideId);
    expect(reminders[0]?.leadMinutes).toBe(15);
  });

  it('skips cancelled lessons', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424208');
    const student = await createStudent(agent);
    const now = new Date('2026-08-15T12:00:00.000Z');
    await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
      status: 'cancelled',
    });

    expect(await listDueReminders(now)).toEqual([]);
  });

  it('returns personal events when opted in', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424209');
    await agent.patch('/api/auth/me').send({ telegramNotify: { personal: true } }).expect(200);
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const workGroup = groups.find((g) => g.name === 'Работа')!;
    const now = new Date('2026-08-15T12:00:00.000Z');
    const startUtc = new Date('2026-08-15T12:20:00.000Z');

    const inserted = await query<{ id: string }>(
      `INSERT INTO personal_events (tutor_id, group_id, title, start_utc, duration_min)
       VALUES ($1, $2, $3, $4, 60)
       RETURNING id`,
      [tutorId, workGroup.id, 'Встреча', startUtc.toISOString()],
    );

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      kind: 'personal',
      telegramUserId: 424209,
      role: 'tutor',
      event: {
        id: inserted.rows[0]!.id,
        title: 'Встреча',
        groupName: 'Работа',
      },
    });
  });

  it('filters personal events by personalGroupIds', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424210');
    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const workGroup = groups.find((g) => g.name === 'Работа')!;
    const familyGroup = groups.find((g) => g.name === 'Семья')!;
    await agent
      .patch('/api/auth/me')
      .send({ telegramNotify: { personal: true, personalGroupIds: [workGroup.id] } })
      .expect(200);

    const now = new Date('2026-08-15T12:00:00.000Z');
    const startUtc = new Date('2026-08-15T12:20:00.000Z');
    await query(
      `INSERT INTO personal_events (tutor_id, group_id, title, start_utc, duration_min)
       VALUES ($1, $2, $3, $4, 60), ($1, $5, $6, $4, 60)`,
      [tutorId, workGroup.id, 'Work call', startUtc.toISOString(), familyGroup.id, 'Family'],
    );

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.event?.title).toBe('Work call');
  });

  it('returns a student reminder independently of tutor notify flags', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await agent.patch('/api/auth/me').send({ telegramNotify: { enabled: false } }).expect(200);
    const student = await agent
      .post('/api/students')
      .send({
        name: 'Student One',
        hue: 200,
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        telegramUsername: 'stu_due_1',
        meetUrl: 'https://meet.google.com/stu-dent-link',
      })
      .expect(201);

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '9001', telegramUsername: 'stu_due_1' })
      .expect(200);

    const now = new Date('2026-08-15T12:00:00.000Z');
    const lessonId = await insertLesson({
      tutorId,
      studentId: student.body.id,
      startUtc: new Date('2026-08-15T12:20:00.000Z'),
    });

    const reminders = await listDueReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      kind: 'lesson',
      telegramUserId: 9001,
      role: 'student',
      leadMinutes: 30,
      silent: false,
      lesson: { id: lessonId, meetUrl: 'https://meet.google.com/stu-dent-link' },
    });
  });

  it('GET /api/bot/reminders/due then POST /sent hides the reminder', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424211');
    const student = await createStudent(agent);
    const start = new Date();
    start.setUTCMinutes(start.getUTCMinutes() + 20, 0, 0);
    const lessonId = await insertLesson({
      tutorId,
      studentId: student.id,
      startUtc: start,
    });

    const due = await request(app)
      .get('/api/bot/reminders/due')
      .set('Authorization', `Bearer ${botToken()}`)
      .expect(200);
    expect(due.body.reminders).toHaveLength(1);
    expect(due.body.reminders[0].lesson.id).toBe(lessonId);

    await request(app)
      .post('/api/bot/reminders/sent')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({
        reminders: [{ telegramUserId: 424211, kind: 'lesson', entityId: lessonId }],
      })
      .expect(204);

    const again = await request(app)
      .get('/api/bot/reminders/due')
      .set('Authorization', `Bearer ${botToken()}`)
      .expect(200);
    expect(again.body.reminders).toEqual([]);
  });
});
