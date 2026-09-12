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

  it('reschedules unpaid completed lesson into the lead window and returns a due reminder', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424301');
    const student = await createStudent(agent);
    const pastStart = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.id, startUtc: pastStart, durationMin: 60 })
      .expect(201);

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const listed = await agent.get('/api/lessons').query({ from, to }).expect(200);
    expect(listed.body[0].status).toBe('completed');
    expect(listed.body[0].paid).toBe(false);

    await markRemindersSent([
      { telegramUserId: 424301, kind: 'lesson', entityId: lesson.body.id },
    ]);

    const futureStart = new Date(Date.now() + 20 * 60_000).toISOString();
    const patched = await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: futureStart, restoreBalance: true })
      .expect(200);
    expect(patched.body.status).toBe('planned');

    const reminders = await listDueReminders(new Date());
    const lessonReminders = reminders.filter((r) => r.kind === 'lesson');
    const reschedules = reminders.filter((r) => r.kind === 'reschedule');
    expect(lessonReminders).toHaveLength(1);
    expect(lessonReminders[0]).toMatchObject({
      kind: 'lesson',
      telegramUserId: 424301,
      role: 'tutor',
      lesson: { id: lesson.body.id, status: 'planned' },
    });
    expect(reschedules).toHaveLength(1);
    expect(reschedules[0]).toMatchObject({
      kind: 'reschedule',
      telegramUserId: 424301,
      role: 'tutor',
      reschedule: {
        lessonId: lesson.body.id,
        charged: false,
      },
    });
    expect(reschedules[0]?.reschedule?.fromStartUtc).toBe(listed.body[0].startUtc);
    expect(reschedules[0]?.reschedule?.toStartUtc).toBe(patched.body.startUtc);
  });

  it('returns a reminder again after startUtc changes inside the lead window', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424302');
    const student = await createStudent(agent);
    const startUtc = new Date(Date.now() + 15 * 60_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.id, startUtc, durationMin: 60 })
      .expect(201);

    await markRemindersSent([
      { telegramUserId: 424302, kind: 'lesson', entityId: lesson.body.id },
    ]);
    expect(await listDueReminders(new Date())).toEqual([]);

    const movedStart = new Date(Date.now() + 25 * 60_000).toISOString();
    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: movedStart })
      .expect(200);

    const reminders = await listDueReminders(new Date());
    expect(reminders.filter((r) => r.kind === 'lesson')).toHaveLength(1);
    expect(reminders.filter((r) => r.kind === 'lesson')[0]?.lesson?.id).toBe(lesson.body.id);
    expect(reminders.filter((r) => r.kind === 'reschedule')).toHaveLength(1);
  });

  it('returns a personal reminder again after startUtc changes', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424303');
    await agent.patch('/api/auth/me').send({ telegramNotify: { personal: true } }).expect(200);
    const groups = await agent.get('/api/personal-event-groups').expect(200);
    const workGroup = groups.body.find((g: { name: string }) => g.name === 'Работа');
    expect(workGroup).toBeTruthy();

    const startUtc = new Date(Date.now() + 15 * 60_000).toISOString();
    const created = await agent
      .post('/api/personal-events')
      .send({
        groupId: workGroup.id,
        title: 'Call',
        startUtc,
        durationMin: 60,
      })
      .expect(201);

    await markRemindersSent([
      { telegramUserId: 424303, kind: 'personal', entityId: created.body.id },
    ]);
    expect(await listDueReminders(new Date())).toEqual([]);

    const movedStart = new Date(Date.now() + 25 * 60_000).toISOString();
    await agent
      .patch(`/api/personal-events/${created.body.id}`)
      .send({ startUtc: movedStart })
      .expect(200);

    const reminders = await listDueReminders(new Date());
    expect(reminders.filter((r) => r.kind === 'personal')).toHaveLength(1);
    expect(reminders.filter((r) => r.kind === 'personal')[0]?.event?.id).toBe(created.body.id);
  });

  it('queues a tutor reschedule notice without charge for a future move', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424304');
    const student = await createStudent(agent);
    const fromStart = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.id, startUtc: fromStart, durationMin: 60 })
      .expect(201);

    const toStart = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const patched = await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: toStart })
      .expect(200);

    const reminders = await listDueReminders(new Date());
    const reschedules = reminders.filter((r) => r.kind === 'reschedule');
    expect(reschedules).toHaveLength(1);
    expect(reschedules[0]).toMatchObject({
      kind: 'reschedule',
      telegramUserId: 424304,
      role: 'tutor',
      silent: false,
      reschedule: {
        lessonId: lesson.body.id,
        fromStartUtc: lesson.body.startUtc,
        toStartUtc: patched.body.startUtc,
        studentName: 'Leo',
        charged: false,
      },
    });
  });

  it('marks a charged past lesson reschedule as со списанием when charge is kept', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424305');
    const student = await agent
      .post('/api/students')
      .send({ name: 'Leo', prepaid: 0, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const pastStart = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc: pastStart, durationMin: 60 })
      .expect(201);

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const listed = await agent.get('/api/lessons').query({ from, to }).expect(200);
    expect(listed.body[0].status).toBe('completed');
    expect(listed.body[0].balanceCharged).toBe(true);

    const stillPast = new Date(Date.now() - 3_600_000).toISOString();
    const patched = await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: stillPast })
      .expect(200);
    expect(patched.body.status).toBe('completed');
    expect(patched.body.balanceCharged).toBe(true);

    const reschedules = (await listDueReminders(new Date())).filter((r) => r.kind === 'reschedule');
    expect(reschedules).toHaveLength(1);
    expect(reschedules[0]?.reschedule).toMatchObject({
      lessonId: lesson.body.id,
      charged: true,
    });
  });

  it('notifies a linked student about a reschedule even if tutor notify is off', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await agent.patch('/api/auth/me').send({ telegramNotify: { enabled: false } }).expect(200);
    const student = await agent
      .post('/api/students')
      .send({
        name: 'Student One',
        hue: 200,
        currency: 'EUR',
        prepaid: 0,
        debt: 0,
        telegramUsername: 'stu_move_1',
      })
      .expect(201);

    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '9002', telegramUsername: 'stu_move_1' })
      .expect(200);

    const fromStart = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc: fromStart, durationMin: 60 })
      .expect(201);

    const toStart = new Date(Date.now() + 4 * 3_600_000).toISOString();
    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ startUtc: toStart }).expect(200);

    const reminders = await listDueReminders(new Date());
    expect(reminders.filter((r) => r.kind === 'reschedule')).toEqual([
      expect.objectContaining({
        kind: 'reschedule',
        telegramUserId: 9002,
        role: 'student',
        silent: false,
        reschedule: expect.objectContaining({
          lessonId: lesson.body.id,
          charged: false,
        }),
      }),
    ]);
  });

  it('GET /api/bot/reminders/due then POST /sent hides a reschedule notice', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTelegram(agent, app, '424306');
    const student = await createStudent(agent);
    const fromStart = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.id, startUtc: fromStart, durationMin: 60 })
      .expect(201);

    const toStart = new Date(Date.now() + 4 * 3_600_000).toISOString();
    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ startUtc: toStart }).expect(200);

    const due = await request(app)
      .get('/api/bot/reminders/due')
      .set('Authorization', `Bearer ${botToken()}`)
      .expect(200);
    const notice = due.body.reminders.find((r: { kind: string }) => r.kind === 'reschedule');
    expect(notice?.reschedule.lessonId).toBe(lesson.body.id);

    await request(app)
      .post('/api/bot/reminders/sent')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({
        reminders: [
          { telegramUserId: 424306, kind: 'reschedule', entityId: notice.reschedule.id },
        ],
      })
      .expect(204);

    const again = await request(app)
      .get('/api/bot/reminders/due')
      .set('Authorization', `Bearer ${botToken()}`)
      .expect(200);
    expect(again.body.reminders.filter((r: { kind: string }) => r.kind === 'reschedule')).toEqual(
      [],
    );
  });
});
