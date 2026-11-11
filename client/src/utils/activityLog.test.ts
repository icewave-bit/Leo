import { describe, expect, it } from 'vitest';
import type { ActivityLogEntry } from '../api/types';
import { buildLogStory } from './activityLog';

function entry(partial: Partial<ActivityLogEntry>): ActivityLogEntry {
  return {
    id: '1',
    occurredAt: '2026-04-02T12:00:00.000Z',
    status: 'ok',
    actor: 'user',
    action: 'delete',
    entityType: 'tax',
    entityId: 'm1',
    entityLabel: 'Lea',
    studentId: 's1',
    summary: 'Удалена налоговая запись · 200 EUR · 02.04.2026 · Lea',
    details: {},
    errorCode: null,
    errorMessage: null,
    httpMethod: 'DELETE',
    httpPath: '/api/taxes/m1',
    httpStatus: 204,
    ...partial,
  };
}

describe('buildLogStory tax rows', () => {
  it('shows what a deleted tax row contained', () => {
    const story = buildLogStory(
      entry({
        details: {
          studentName: 'Lea',
          deleted: true,
          before: {
            studentName: 'Lea',
            amount: 200,
            currency: 'EUR',
            receivedOn: '2026-04-02',
            taxPaid: false,
            comment: 'УСН',
          },
          after: null,
        },
      }),
      'Europe/Minsk',
    );

    expect(story.deleted).toBe(true);
    expect(story.facts).toEqual(
      expect.arrayContaining([
        { label: 'Ученик', value: 'Lea' },
        { label: 'Сумма', value: '200 EUR' },
        { label: 'Дата поступления', value: '02.04.2026' },
        { label: 'Налог уплачен', value: 'нет' },
        { label: 'Комментарий', value: 'УСН' },
      ]),
    );
    expect(story.changes).toEqual([]);
  });
});
