import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { waitForActivityLog } from '../middleware/activityLog.js';
import { setupTestDb, teardownTestDb } from './db.js';
import { registerTutor } from './helpers.js';

function wideRange() {
  return {
    from: new Date(Date.now() - 86400000).toISOString(),
    to: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function listLogs(
  agent: Awaited<ReturnType<typeof registerTutor>>['agent'],
  extra: Record<string, string> = {},
) {
  await waitForActivityLog();
  const { from, to } = wideRange();
  const params = new URLSearchParams({ from, to, ...extra });
  const res = await agent.get(`/api/activity-log?${params}`).expect(200);
  return res.body as { items: Array<Record<string, unknown>>; total: number };
}

describe('activity log', () => {
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

  it('records student create and does not log list GET', async () => {
    const { agent } = await registerTutor(app);

    await agent.post('/api/students').send({ name: 'Maria' }).expect(201);
    await agent.get('/api/students').expect(200);

    const logs = await listLogs(agent);
    expect(logs.total).toBe(1);
    expect(logs.items[0]).toMatchObject({
      status: 'ok',
      actor: 'user',
      action: 'create',
      entityType: 'student',
      summary: 'Создан ученик · Maria',
    });
    expect(logs.items[0]?.details).toMatchObject({ studentName: 'Maria' });
  });

  it('records validation failure without storing the password', async () => {
    const { agent, email } = await registerTutor(app);

    await agent.post('/api/students').send({ name: '' }).expect(400);
    await agent
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    const logs = await listLogs(agent);
    const createFail = logs.items.find((row) => row.action === 'create');
    const loginFail = logs.items.find((row) => row.action === 'login');

    expect(createFail).toMatchObject({
      status: 'error',
      errorCode: 'VALIDATION',
    });
    expect(JSON.stringify(createFail?.details)).not.toContain('password');

    expect(loginFail).toMatchObject({
      status: 'error',
      entityType: 'auth',
    });
    expect(JSON.stringify(loginFail?.details)).not.toContain('wrong-password');
    expect(JSON.stringify(loginFail?.details)).toContain('[redacted]');
  });

  it('filters by entity type and keeps tutors isolated', async () => {
    const a = await registerTutor(app);
    const b = await registerTutor(app);

    await a.agent.post('/api/students').send({ name: 'Secret' }).expect(201);
    await b.agent.post('/api/students').send({ name: 'Other' }).expect(201);

    const aLogs = await listLogs(a.agent);
    const bLogs = await listLogs(b.agent);
    expect(aLogs.items.every((row) => String(row.summary).includes('Secret'))).toBe(true);
    expect(bLogs.items.every((row) => String(row.summary).includes('Other'))).toBe(true);

    const studentsOnly = await listLogs(a.agent, { entityType: 'student' });
    expect(studentsOnly.total).toBe(1);

    const taxesOnly = await listLogs(a.agent, { entityType: 'tax' });
    expect(taxesOnly.total).toBe(0);
  });

  it('records a settings change', async () => {
    const { agent } = await registerTutor(app);
    await agent.patch('/api/auth/me').send({ taxRatePercent: 13 }).expect(200);

    const logs = await listLogs(agent);
    expect(logs.items[0]).toMatchObject({
      status: 'ok',
      entityType: 'settings',
      summary: 'Настройки · ставка налога',
    });
  });

  it('lesson log includes the student name', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent.post('/api/students').send({ name: 'Maria' }).expect(201);
    await waitForActivityLog();

    await agent
      .post('/api/lessons')
      .send({
        studentId: student.body.id,
        startUtc: '2030-06-03T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);

    const logs = await listLogs(agent, { entityType: 'lesson' });
    expect(logs.items[0]).toMatchObject({
      status: 'ok',
      action: 'create',
      entityType: 'lesson',
      summary: 'Создан урок · Maria',
    });
    expect(logs.items[0]?.studentId).toBe(student.body.id);
    expect(logs.items[0]?.details).toMatchObject({
      studentName: 'Maria',
      after: {
        startUtc: '2030-06-03T10:00:00.000Z',
        durationMin: 60,
        status: 'planned',
      },
    });
  });

  it('stores before/after times for a lesson move and lists later actions', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent.post('/api/students').send({ name: 'Maria' }).expect(201);
    const lesson = await agent
      .post('/api/lessons')
      .send({
        studentId: student.body.id,
        startUtc: '2030-06-03T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);
    await waitForActivityLog();

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ startUtc: '2030-06-10T14:00:00.000Z' })
      .expect(200);
    await waitForActivityLog();

    await agent
      .patch(`/api/lessons/${lesson.body.id}`)
      .send({ status: 'completed' })
      .expect(200);

    const logs = await listLogs(agent, { entityType: 'lesson' });
    const move = logs.items.find((row) => row.action === 'move') as
      | { id: string; details: Record<string, unknown> }
      | undefined;
    expect(move?.details).toMatchObject({
      before: { startUtc: '2030-06-03T10:00:00.000Z' },
      after: { startUtc: '2030-06-10T14:00:00.000Z' },
    });

    const related = await agent.get(`/api/activity-log/${move!.id}/related`).expect(200);
    expect(
      related.body.items.some(
        (row: { summary: string }) => String(row.summary).includes('проведён'),
      ),
    ).toBe(true);
  });

  it('records a recurring skip when a series lesson is moved', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent.post('/api/students').send({ name: 'Maria' }).expect(201);
    await agent
      .post('/api/recurring-schedules')
      .send({
        studentId: student.body.id,
        weekdays: [0],
        startMinutes: 540,
        academicUnits: 1,
        startDate: '2030-06-03',
        endDate: '2030-06-17',
      })
      .expect(201);

    const lessons = await agent
      .get('/api/lessons')
      .query({ from: '2030-06-01T00:00:00.000Z', to: '2030-07-01T00:00:00.000Z' })
      .expect(200);
    const target = lessons.body[0] as { id: string; startUtc: string };

    await waitForActivityLog();
    await agent
      .patch(`/api/lessons/${target.id}`)
      .send({ startUtc: '2030-06-10T14:00:00.000Z' })
      .expect(200);

    const logs = await listLogs(agent, { entityType: 'lesson' });
    const move = logs.items.find((row) => row.action === 'move') as
      | { details: { effects?: Array<{ type: string }> } }
      | undefined;
    expect(move?.details.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'recurring_skip' })]),
    );
  });

  it('records balance side effects when a lesson is completed', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 100, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const lesson = await agent
      .post('/api/lessons')
      .send({
        studentId: student.body.id,
        startUtc: '2030-06-03T10:00:00.000Z',
        durationMin: 60,
      })
      .expect(201);
    await waitForActivityLog();

    await agent.patch(`/api/lessons/${lesson.body.id}`).send({ status: 'completed' }).expect(200);

    const logs = await listLogs(agent, { entityType: 'lesson' });
    const complete = logs.items.find((row) => String(row.summary).includes('проведён')) as
      | { details: { effects?: Array<{ type: string; summary: string }> } }
      | undefined;
    expect(complete?.details.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'balance' })]),
    );
  });

  it('does not leak related logs across tutors', async () => {
    const a = await registerTutor(app);
    const b = await registerTutor(app);
    await a.agent.post('/api/students').send({ name: 'Secret' }).expect(201);
    const logs = await listLogs(a.agent);
    const id = logs.items[0]?.id as string;

    await b.agent.get(`/api/activity-log/${id}/related`).expect(404);
  });

  it('records automatic lesson completion as a system event with balance effects', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 100, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const lesson = await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await waitForActivityLog();

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await agent.get('/api/lessons').query({ from, to }).expect(200);

    const logs = await listLogs(agent, { entityType: 'lesson', actor: 'system' });
    expect(logs.total).toBe(1);
    expect(logs.items[0]).toMatchObject({
      status: 'ok',
      actor: 'system',
      action: 'update',
      entityType: 'lesson',
      entityId: lesson.body.id,
      studentId: student.body.id,
      summary: 'Статус урока: проведён · Pack',
    });
    expect(logs.items[0]?.details).toMatchObject({
      studentName: 'Pack',
      before: { status: 'planned' },
      after: { status: 'completed' },
    });
    expect(
      (logs.items[0]?.details as { effects?: Array<{ type: string }> }).effects,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'balance' })]));
  });

  it('records lesson cancellations when a student is archived', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent.post('/api/students').send({ name: 'Busy' }).expect(201);
    await agent
      .post('/api/lessons')
      .send({
        studentId: student.body.id,
        startUtc: new Date(Date.now() + 86_400_000).toISOString(),
        durationMin: 60,
      })
      .expect(201);
    await waitForActivityLog();

    await agent.post(`/api/students/${student.body.id}/archive`).expect(200);

    const lessonLogs = await listLogs(agent, { entityType: 'lesson' });
    expect(lessonLogs.items.some((row) => String(row.summary).includes('отменён'))).toBe(false);

    const studentLogs = await listLogs(agent, { entityType: 'student' });
    const archive = studentLogs.items.find((row) => String(row.summary).includes('архив')) as
      | { details: { effects?: Array<{ type: string; summary: string; startUtc?: string }> } }
      | undefined;
    expect(archive?.details.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'lesson_cancel',
          summary: 'Отменён запланированный урок',
        }),
      ]),
    );
    expect(archive?.details.effects?.some((effect) => Boolean(effect.startUtc))).toBe(true);
  });

  it('records lessons marked paid after a balance top-up', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Debtor', prepaid: 0, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);
    await waitForActivityLog();

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await agent.get('/api/lessons').query({ from, to }).expect(200);

    const systemBefore = await listLogs(agent, { actor: 'system' });

    await agent
      .patch(`/api/students/${student.body.id}`)
      .send({ prepaid: 20 })
      .expect(200);

    const systemAfter = await listLogs(agent, { actor: 'system' });
    expect(systemAfter.total).toBe(systemBefore.total);

    const lessonLogs = await listLogs(agent, { entityType: 'lesson' });
    expect(lessonLogs.items.some((row) => String(row.summary).includes('отмечен оплаченным'))).toBe(
      false,
    );

    const balanceLogs = await listLogs(agent, { entityType: 'balance' });
    expect(
      (balanceLogs.items[0]?.details as { effects?: Array<{ type: string; startUtc?: string }> })
        .effects,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'lesson_paid',
          summary: 'Урок отмечен оплаченным',
        }),
      ]),
    );
  });

  it('does not auto-complete a lesson that has not ended', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent.post('/api/students').send({ name: 'Soon' }).expect(201);
    const startUtc = new Date(Date.now() + 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const list = await agent.get('/api/lessons').query({ from, to }).expect(200);
    expect(list.body[0].status).toBe('planned');

    const logs = await listLogs(agent, { actor: 'system' });
    expect(logs.total).toBe(0);
  });

  it('does not auto-complete on a student-scoped lesson list', async () => {
    const { agent } = await registerTutor(app);
    const student = await agent
      .post('/api/students')
      .send({ name: 'Pack', prepaid: 100, debt: 0, rate: 20, currency: 'EUR' })
      .expect(201);
    const startUtc = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await agent
      .post('/api/lessons')
      .send({ studentId: student.body.id, startUtc, durationMin: 60 })
      .expect(201);

    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const list = await agent
      .get('/api/lessons')
      .query({ from, to, studentId: student.body.id })
      .expect(200);
    expect(list.body[0].status).toBe('planned');

    const logs = await listLogs(agent, { actor: 'system' });
    expect(logs.total).toBe(0);
  });
});
