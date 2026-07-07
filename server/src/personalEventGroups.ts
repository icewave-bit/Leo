import { query } from './db.js';
import { toPersonalEventGroup, type PersonalEventGroupRow } from './mappers.js';

export const DEFAULT_PERSONAL_EVENT_GROUPS = [
  { name: 'Работа', color: '#6366f1', sortOrder: 0 },
  { name: 'Семья', color: '#f59e0b', sortOrder: 1 },
  { name: 'Личное', color: '#10b981', sortOrder: 2 },
] as const;

const GROUP_COLUMNS = `id, tutor_id, name, color, sort_order, created_at, updated_at`;

export async function listPersonalEventGroups(
  tutorId: string,
): Promise<PersonalEventGroupRow[]> {
  const result = await query<PersonalEventGroupRow>(
    `SELECT ${GROUP_COLUMNS}
     FROM personal_event_groups
     WHERE tutor_id = $1
     ORDER BY sort_order, name`,
    [tutorId],
  );
  return result.rows;
}

export async function ensureDefaultPersonalEventGroups(
  tutorId: string,
): Promise<PersonalEventGroupRow[]> {
  const existing = await listPersonalEventGroups(tutorId);
  if (existing.length > 0) return existing;

  for (const group of DEFAULT_PERSONAL_EVENT_GROUPS) {
    await query(
      `INSERT INTO personal_event_groups (tutor_id, name, color, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [tutorId, group.name, group.color, group.sortOrder],
    );
  }

  return listPersonalEventGroups(tutorId);
}

export async function assertPersonalEventGroupOwned(
  tutorId: string,
  groupId: string,
): Promise<PersonalEventGroupRow> {
  const result = await query<PersonalEventGroupRow>(
    `SELECT ${GROUP_COLUMNS}
     FROM personal_event_groups
     WHERE id = $1 AND tutor_id = $2`,
    [groupId, tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    const { AppError } = await import('./errors.js');
    throw new AppError('NOT_FOUND', 404, 'Personal event group not found');
  }
  return row;
}

export { toPersonalEventGroup };
