import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { listDueReminders } from '../botReminders.js';
import { loadConfig, resetConfigCache } from '../config.js';
import { query } from '../db.js';
import { ensureDefaultPersonalEventGroups } from '../personalEventGroups.js';
import { addDaysToDateOnly, dateKeyInTz } from '../scheduleSlots.js';
import { VACATION_NOTIFY_DELAY_MS } from '../vacations.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

function botToken(): string {
  return loadConfig().BOT_API_TOKEN;
}

function utcAt(date: string, hour = 15): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

async function linkTutorTelegram(agent: request.Agent, app: Express, telegramUserId: string) {
  const codeRes = await agent.post('/api/auth/telegram/link-code').expect(201);
  await request(app)
    .post('/api/bot/link')
    .set('Authorization', `Bearer ${botToken()}`)
    .send({ code: codeRes.body.code, telegramUserId })
    .expect(200);
}

async function createStudent(
  agent: request.Agent,
  name = 'Leo',
  extra: Record<string, unknown> = {},
) {
  const res = await agent
    .post('/api/students')
    .send({
      name,
      hue: 120,
      currency: 'EUR',
      prepaid: 0,
      debt: 0,
      ...extra,
    })
    .expect(201);
  return res.body as { id: string; name: string; vacation: unknown };
}

async function createLesson(agent: request.Agent, studentId: string, startUtc: string) {
  const res = await agent
    .post('/api/lessons')
    .send({ studentId, startUtc, durationMin: 60 })
    .expect(201);
  return res.body as { id: string; startUtc: string; status: string };
}

async function listLessons(agent: request.Agent, from: string, to: string, studentId?: string) {
  const res = await agent
    .get('/api/lessons')
    .query({ from, to, ...(studentId ? { studentId } : {}) })
    .expect(200);
  return res.body as Array<{ id: string; startUtc: string; status: string }>;
}

async function outboxRows() {
  const result = await query<{
    id: string;
    kind: string;
    role: string;
    telegram_user_id: string;
    entity_id: string;
    available_at: Date;
    payload: Record<string, unknown>;
  }>(
    `SELECT id, kind, role, telegram_user_id::text AS telegram_user_id, entity_id, available_at, payload
     FROM telegram_notification_outbox
     ORDER BY created_at, id`,
  );
  return result.rows;
}

describe('vacations', () => {
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

  it('1. student vacation hides planned future lessons in range', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    const inRange = await createLesson(agent, student.id, '2030-10-07T15:00:00.000Z');
    const alsoInRange = await createLesson(agent, student.id, '2030-10-09T15:00:00.000Z');
    const after = await createLesson(agent, student.id, '2030-10-21T15:00:00.000Z');

    const created = await agent
      .post('/api/vacations')
      .send({
        studentId: student.id,
        startDate: '2030-10-07',
        endDate: '2030-10-20',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      studentId: student.id,
      startDate: '2030-10-07',
      endDate: '2030-10-20',
      cancelledAt: null,
      nextLessonStartUtc: after.startUtc,
    });
    expect(created.body.removedLessonStarts).toEqual(
      expect.arrayContaining([inRange.startUtc, alsoInRange.startUtc]),
    );
    expect(created.body.removedLessonStarts).toHaveLength(2);
    expect(new Date(created.body.notifyAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);

    const listed = await listLessons(
      agent,
      '2030-10-01T00:00:00.000Z',
      '2030-11-01T00:00:00.000Z',
    );
    expect(listed.map((l) => l.id).sort()).toEqual([after.id]);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].vacation).toMatchObject({
      id: created.body.id,
      startDate: '2030-10-07',
      endDate: '2030-10-20',
    });
  });

  it('2. completed, in-progress, and past planned lessons are kept', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    const today = dateKeyInTz(new Date(), 'UTC');
    const futureInRange = addDaysToDateOnly(today, 3);

    const completed = await query<{ id: string }>(
      `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, status)
       VALUES ($1, $2, $3, 60, 'completed')
       RETURNING id`,
      [tutorId, student.id, utcAt(addDaysToDateOnly(today, 4))],
    );
    const inProgress = await query<{ id: string }>(
      `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, status)
       VALUES ($1, $2, now() - interval '10 minutes', 60, 'planned')
       RETURNING id`,
      [tutorId, student.id],
    );
    const pastPlanned = await query<{ id: string }>(
      `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, status)
       VALUES ($1, $2, now() - interval '2 days', 60, 'planned')
       RETURNING id`,
      [tutorId, student.id],
    );
    const future = await createLesson(agent, student.id, utcAt(futureInRange));

    await agent
      .post('/api/vacations')
      .send({
        studentId: student.id,
        startDate: addDaysToDateOnly(today, -7),
        endDate: addDaysToDateOnly(today, 10),
      })
      .expect(201);

    const listed = await listLessons(
      agent,
      new Date(Date.now() - 10 * 86_400_000).toISOString(),
      new Date(Date.now() + 20 * 86_400_000).toISOString(),
      student.id,
    );
    const ids = listed.map((l) => l.id);
    expect(ids).toContain(completed.rows[0]!.id);
    expect(ids).toContain(inProgress.rows[0]!.id);
    expect(ids).toContain(pastPlanned.rows[0]!.id);
    expect(ids).not.toContain(future.id);
  });

  it('3. vacation outbox is delayed and never uses deleted kind', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTutorTelegram(agent, app, '510001');
    const student = await createStudent(agent, 'Leo', { telegramUsername: 'vac_stu_3' });
    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '910001', telegramUsername: 'vac_stu_3' })
      .expect(200);

    await createLesson(agent, student.id, '2030-10-07T15:00:00.000Z');
    const before = await outboxRows();
    expect(before.some((row) => row.kind === 'created')).toBe(true);

    const beforeMs = Date.now();
    await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-10-07', endDate: '2030-10-20' })
      .expect(201);
    const afterMs = Date.now();

    const rows = await outboxRows();
    expect(rows.filter((row) => row.kind === 'deleted')).toEqual([]);
    expect(rows.filter((row) => row.kind === 'created')).toEqual([]);
    const vacationRows = rows.filter((row) => row.kind === 'vacation');
    expect(vacationRows.length).toBeGreaterThanOrEqual(1);
    for (const row of vacationRows) {
      const available = row.available_at.getTime();
      expect(available).toBeGreaterThanOrEqual(beforeMs + VACATION_NOTIFY_DELAY_MS - 2000);
      expect(available).toBeLessThanOrEqual(afterMs + VACATION_NOTIFY_DELAY_MS + 2000);
    }

    const dueNow = (await listDueReminders(new Date())).filter((r) => r.kind === 'vacation');
    expect(dueNow).toEqual([]);
  });

  it('4. due list returns vacation notice after available_at', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTutorTelegram(agent, app, '510002');
    const student = await createStudent(agent);
    const removed = await createLesson(agent, student.id, '2030-10-07T15:00:00.000Z');
    const next = await createLesson(agent, student.id, '2030-10-21T15:00:00.000Z');

    await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-10-07', endDate: '2030-10-20' })
      .expect(201);

    await query(`UPDATE telegram_notification_outbox SET available_at = now() - interval '1 second'`);

    const due = (await listDueReminders(new Date())).filter((r) => r.kind === 'vacation');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      kind: 'vacation',
      telegramUserId: 510002,
      role: 'tutor',
      timezone: 'UTC',
      vacation: {
        scope: 'student',
        studentName: 'Leo',
        startDate: '2030-10-07',
        endDate: '2030-10-20',
        nextStartUtc: next.startUtc,
      },
    });
    expect(due[0]?.vacation?.removedStarts).toEqual([removed.startUtc]);
  });

  it('5. cancel before notify drops outbox, restores lessons, no cancelled notice', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    await linkTutorTelegram(agent, app, '510003');
    const student = await createStudent(agent);
    const lesson = await createLesson(agent, student.id, '2030-10-07T15:00:00.000Z');

    const vacation = await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-10-07', endDate: '2030-10-20' })
      .expect(201);

    expect(await outboxRows()).toHaveLength(1);

    const returned = await agent.post(`/api/vacations/${vacation.body.id}/return`).expect(200);
    expect(returned.body.cancelledAt).not.toBeNull();

    const listed = await listLessons(
      agent,
      '2030-10-01T00:00:00.000Z',
      '2030-11-01T00:00:00.000Z',
    );
    expect(listed.some((l) => l.startUtc === lesson.startUtc)).toBe(true);

    const rows = await outboxRows();
    expect(rows.filter((row) => row.kind === 'vacation')).toEqual([]);
    expect(rows.filter((row) => row.kind === 'vacation_cancelled')).toEqual([]);

    const open = await agent.get('/api/vacations').expect(200);
    expect(open.body.vacations).toEqual([]);

    const students = await agent.get('/api/students').expect(200);
    expect(students.body[0].vacation).toBeNull();
  });

  it('6. return from today mid-vacation restores from today and keeps earlier days hidden', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    const today = dateKeyInTz(new Date(), 'UTC');
    const startDate = addDaysToDateOnly(today, -5);
    const endDate = addDaysToDateOnly(today, 10);
    const tomorrow = addDaysToDateOnly(today, 1);
    const later = addDaysToDateOnly(today, 8);

    const soon = await createLesson(agent, student.id, utcAt(tomorrow));
    const far = await createLesson(agent, student.id, utcAt(later));

    const vacation = await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate, endDate })
      .expect(201);

    const pastStart = utcAt(addDaysToDateOnly(today, -2));
    await query(
      `INSERT INTO vacation_hidden_items (vacation_id, kind, original_id, start_utc, snapshot)
       VALUES ($1, 'lesson', gen_random_uuid(), $2, $3::jsonb)`,
      [vacation.body.id, pastStart, JSON.stringify({ student_id: student.id, tutor_id: tutorId })],
    );

    const returned = await agent.post(`/api/vacations/${vacation.body.id}/return`).expect(200);
    expect(returned.body.cancelledAt).toBeNull();
    expect(returned.body.endDate).toBe(addDaysToDateOnly(today, -1));

    const listed = await listLessons(
      agent,
      new Date(Date.now() - 10 * 86_400_000).toISOString(),
      new Date(Date.now() + 20 * 86_400_000).toISOString(),
    );
    const starts = listed.map((l) => l.startUtc);
    expect(starts).toContain(soon.startUtc);
    expect(starts).toContain(far.startUtc);
    expect(starts).not.toContain(pastStart);

    const leftover = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM vacation_hidden_items
       WHERE vacation_id = $1 AND restored_at IS NULL`,
      [vacation.body.id],
    );
    expect(Number(leftover.rows[0]!.n)).toBe(1);

    const open = await agent.get('/api/vacations').expect(200);
    expect(open.body.vacations).toEqual([]);
  });

  it('7. tutor vacation hides all students’ lessons and selected personal events', async () => {
    const { agent, tutorId } = await registerTutor(app, { timezone: 'UTC' });
    await linkTutorTelegram(agent, app, '510007');
    const anna = await createStudent(agent, 'Anna', { telegramUsername: 'vac_anna_7' });
    const boris = await createStudent(agent, 'Boris', { telegramUsername: 'vac_boris_7' });
    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '910007', telegramUsername: 'vac_anna_7' })
      .expect(200);
    await request(app)
      .post('/api/bot/student/register')
      .set('Authorization', `Bearer ${botToken()}`)
      .send({ telegramUserId: '910008', telegramUsername: 'vac_boris_7' })
      .expect(200);

    const annaLesson = await createLesson(agent, anna.id, '2030-10-08T15:00:00.000Z');
    const borisLesson = await createLesson(agent, boris.id, '2030-10-09T15:00:00.000Z');
    const after = await createLesson(agent, anna.id, '2030-10-22T15:00:00.000Z');

    const groups = await ensureDefaultPersonalEventGroups(tutorId);
    const work = groups.find((g) => g.name === 'Работа')!;
    const family = groups.find((g) => g.name === 'Семья')!;

    const workEvent = await agent
      .post('/api/personal-events')
      .send({
        groupId: work.id,
        title: 'Work call',
        startUtc: '2030-10-08T11:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);
    const familyEvent = await agent
      .post('/api/personal-events')
      .send({
        groupId: family.id,
        title: 'Family',
        startUtc: '2030-10-08T12:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    const created = await agent
      .post('/api/vacations')
      .send({
        startDate: '2030-10-07',
        endDate: '2030-10-20',
        personalGroupIds: [work.id],
      })
      .expect(201);

    expect(created.body.studentId).toBeNull();
    expect(created.body.personalGroupIds).toEqual([work.id]);

    const lessons = await listLessons(
      agent,
      '2030-10-01T00:00:00.000Z',
      '2030-11-01T00:00:00.000Z',
    );
    expect(lessons.map((l) => l.id)).toEqual([after.id]);
    expect(lessons.map((l) => l.id)).not.toContain(annaLesson.id);
    expect(lessons.map((l) => l.id)).not.toContain(borisLesson.id);

    const events = await agent
      .get('/api/personal-events')
      .query({ from: '2030-10-01T00:00:00.000Z', to: '2030-11-01T00:00:00.000Z' })
      .expect(200);
    expect(events.body.map((e: { id: string }) => e.id)).toEqual([familyEvent.body.id]);
    expect(events.body.map((e: { id: string }) => e.id)).not.toContain(workEvent.body.id);

    const rows = await outboxRows();
    const vacationRows = rows.filter((row) => row.kind === 'vacation');
    expect(vacationRows.map((row) => row.role).sort()).toEqual(['student', 'student']);
    expect(vacationRows.map((row) => row.telegram_user_id).sort()).toEqual(['910007', '910008']);
    expect(vacationRows.some((row) => row.telegram_user_id === '510007')).toBe(false);
  });

  it('8. recurring skip blocks rematerialize; return rematerializes from today', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId: student.id,
        weekdays: [0],
        startMinutes: 900,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-24',
      })
      .expect(201);

    const before = await listLessons(
      agent,
      '2030-06-01T00:00:00.000Z',
      '2030-07-01T00:00:00.000Z',
    );
    expect(before.length).toBeGreaterThan(1);

    const vacation = await agent
      .post('/api/vacations')
      .send({
        studentId: student.id,
        startDate: '2030-06-03',
        endDate: '2030-06-17',
      })
      .expect(201);

    const hidden = await listLessons(
      agent,
      '2030-06-01T00:00:00.000Z',
      '2030-07-01T00:00:00.000Z',
    );
    expect(hidden.length).toBeLessThan(before.length);
    expect(hidden.every((l) => l.startUtc >= '2030-06-18T00:00:00.000Z')).toBe(true);

    const skips = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM recurring_schedule_skips`,
    );
    expect(Number(skips.rows[0]!.n)).toBeGreaterThan(0);

    const stillHidden = await listLessons(
      agent,
      '2030-06-01T00:00:00.000Z',
      '2030-07-01T00:00:00.000Z',
    );
    expect(stillHidden).toHaveLength(hidden.length);

    await agent.post(`/api/vacations/${vacation.body.id}/return`).expect(200);

    const restored = await listLessons(
      agent,
      '2030-06-01T00:00:00.000Z',
      '2030-07-01T00:00:00.000Z',
    );
    expect(restored).toHaveLength(before.length);
  });

  it('9. second open vacation for the same student returns 409', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-10-07', endDate: '2030-10-20' })
      .expect(201);

    const conflict = await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-11-01', endDate: '2030-11-10' })
      .expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');

    await agent
      .post('/api/vacations')
      .send({ startDate: '2030-10-07', endDate: '2030-10-20' })
      .expect(201);

    const tutorConflict = await agent
      .post('/api/vacations')
      .send({ startDate: '2030-12-01', endDate: '2030-12-10' })
      .expect(409);
    expect(tutorConflict.body.error.code).toBe('CONFLICT');
  });

  it('10. patch dates expands and shrinks the hidden set', async () => {
    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    const a = await createLesson(agent, student.id, '2030-10-07T15:00:00.000Z');
    const b = await createLesson(agent, student.id, '2030-10-10T15:00:00.000Z');
    const c = await createLesson(agent, student.id, '2030-10-15T15:00:00.000Z');

    const vacation = await agent
      .post('/api/vacations')
      .send({ studentId: student.id, startDate: '2030-10-07', endDate: '2030-10-10' })
      .expect(201);

    let listed = await listLessons(
      agent,
      '2030-10-01T00:00:00.000Z',
      '2030-11-01T00:00:00.000Z',
    );
    expect(listed.map((l) => l.startUtc).sort()).toEqual([c.startUtc]);

    const later = await createLesson(agent, student.id, '2030-10-08T18:00:00.000Z');

    listed = await listLessons(agent, '2030-10-01T00:00:00.000Z', '2030-11-01T00:00:00.000Z');
    expect(listed.map((l) => l.id).sort()).toEqual([c.id, later.id].sort());

    await agent
      .patch(`/api/vacations/${vacation.body.id}`)
      .send({ endDate: '2030-10-20' })
      .expect(200);

    listed = await listLessons(agent, '2030-10-01T00:00:00.000Z', '2030-11-01T00:00:00.000Z');
    expect(listed).toEqual([]);

    await agent
      .patch(`/api/vacations/${vacation.body.id}`)
      .send({ startDate: '2030-10-10', endDate: '2030-10-10' })
      .expect(200);

    listed = await listLessons(agent, '2030-10-01T00:00:00.000Z', '2030-11-01T00:00:00.000Z');
    const starts = listed.map((l) => l.startUtc).sort();
    expect(starts).toContain(a.startUtc);
    expect(starts).toContain(c.startUtc);
    expect(starts).toContain(later.startUtc);
    expect(starts).not.toContain(b.startUtc);
  });

  it('requires auth and rejects personalGroupIds on a student vacation', async () => {
    await request(app).get('/api/vacations').expect(401);

    const { agent } = await registerTutor(app, { timezone: 'UTC' });
    const student = await createStudent(agent);
    const groups = await ensureDefaultPersonalEventGroups(
      (await agent.get('/api/auth/me').expect(200)).body.tutor.id,
    );

    await agent
      .post('/api/vacations')
      .send({
        studentId: student.id,
        startDate: '2030-10-07',
        endDate: '2030-10-06',
      })
      .expect(400);

    await agent
      .post('/api/vacations')
      .send({
        studentId: student.id,
        startDate: '2030-10-07',
        endDate: '2030-10-20',
        personalGroupIds: [groups[0]!.id],
      })
      .expect(400);
  });
});
