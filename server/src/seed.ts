import 'dotenv/config';
import { hashPassword } from './auth/password.js';
import { runMigrations } from './migrate.js';
import pg from 'pg';

const DEMO_EMAIL = 'anna@tutormonitor.app';
const DEMO_PASSWORD = 'demo-password-123';

interface SeedStudent {
  name: string;
  initials: string;
  hue: number;
  tz: string;
  isGroup: boolean;
  members: string[];
  meetUrl?: string;
}

const DEMO_STUDENTS: SeedStudent[] = [
  { name: 'Мария', initials: 'М', hue: 320, tz: 'Europe/Moscow', isGroup: false, members: [] },
  { name: 'Тимур', initials: 'Т', hue: 200, tz: 'Asia/Almaty', isGroup: false, members: [] },
  { name: 'Лена', initials: 'Л', hue: 45, tz: 'Europe/Berlin', isGroup: false, members: [] },
  {
    name: 'Group A2',
    initials: 'GA',
    hue: 120,
    tz: 'UTC',
    isGroup: true,
    members: ['Мария', 'Тимур', 'Лена'],
  },
  {
    name: 'Сабина',
    initials: 'С',
    hue: 280,
    tz: 'Europe/Moscow',
    isGroup: false,
    members: [],
    meetUrl: 'https://meet.google.com/abc-defg-hij',
  },
];

async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  await runMigrations(url);
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    const existing = await client.query('SELECT id FROM tutors WHERE LOWER(email) = $1', [
      DEMO_EMAIL.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      console.log('Demo tutor already exists, skipping seed');
      return;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const tutorResult = await client.query<{ id: string }>(
      `INSERT INTO tutors (email, password_hash, name, initials, subject, timezone)
       VALUES ($1, $2, 'Anna Petrova', 'AP', 'English', 'Europe/Berlin')
       RETURNING id`,
      [DEMO_EMAIL, passwordHash],
    );
    const tutorId = tutorResult.rows[0]!.id;

    const studentIds: Record<string, string> = {};
    for (const s of DEMO_STUDENTS) {
      const r = await client.query<{ id: string; name: string }>(
        `INSERT INTO students (tutor_id, name, initials, hue, tz, meet_url, is_group, members)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name`,
        [
          tutorId,
          s.name,
          s.initials,
          s.hue,
          s.tz,
          s.meetUrl ?? null,
          s.isGroup,
          s.members,
        ],
      );
      studentIds[s.name] = r.rows[0]!.id;
    }

    const now = new Date();
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1);

    const lessonPlan: Array<{
      student: string;
      dayOffset: number;
      hour: number;
      durationMin: number;
      status: string;
      type: string;
      paid: boolean;
    }> = [
      { student: 'Мария', dayOffset: 0, hour: 10, durationMin: 60, status: 'completed', type: 'solo', paid: true },
      { student: 'Тимур', dayOffset: 1, hour: 14, durationMin: 45, status: 'planned', type: 'solo', paid: false },
      { student: 'Лена', dayOffset: 2, hour: 16, durationMin: 60, status: 'cancelled', type: 'solo', paid: false },
      { student: 'Group A2', dayOffset: 3, hour: 11, durationMin: 90, status: 'planned', type: 'group', paid: false },
      { student: 'Сабина', dayOffset: 4, hour: 9, durationMin: 60, status: 'no_show', type: 'solo', paid: false },
      { student: 'Мария', dayOffset: 5, hour: 15, durationMin: 60, status: 'planned', type: 'solo', paid: false },
    ];

    for (const l of lessonPlan) {
      const start = new Date(weekStart);
      start.setUTCDate(start.getUTCDate() + l.dayOffset);
      start.setUTCHours(l.hour, 0, 0, 0);
      await client.query(
        `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, academic_units, status, type, paid)
         VALUES ($1, $2, $3, $4, CASE WHEN $4 >= 90 THEN 2 ELSE 1 END, $5, $6, $7)`,
        [tutorId, studentIds[l.student], start.toISOString(), l.durationMin, l.status, l.type, l.paid],
      );
    }

    console.log(`Seeded demo tutor ${DEMO_EMAIL} with ${DEMO_STUDENTS.length} students and ${lessonPlan.length} lessons`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
