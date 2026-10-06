import { Router } from 'express';
import { z } from 'zod';
import { attachCascadeEffects } from '../activityLog.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../validate.js';
import {
  createVacation,
  listOpenVacations,
  patchVacation,
  returnFromVacation,
  type VacationActivityDiff,
} from '../vacations.js';

async function attachVacationEffects(
  res: Parameters<typeof attachCascadeEffects>[0],
  tutorId: string,
  diff: VacationActivityDiff,
): Promise<void> {
  await attachCascadeEffects(res, tutorId, 'lesson_hide', 'Снят урок', diff.hiddenLessons);
  await attachCascadeEffects(res, tutorId, 'personal_hide', 'Снято событие', diff.hiddenEvents);
  await attachCascadeEffects(res, tutorId, 'lesson_restore', 'Вернули урок', diff.restoredLessons);
  await attachCascadeEffects(
    res,
    tutorId,
    'personal_restore',
    'Вернули событие',
    diff.restoredEvents,
  );
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createVacationSchema = z
  .object({
    studentId: z.string().uuid().nullable().optional(),
    startDate: dateOnly,
    endDate: dateOnly,
    personalGroupIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

const patchVacationSchema = z
  .object({
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    personalGroupIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (data) =>
      data.startDate == null || data.endDate == null || data.endDate >= data.startDate,
    {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    },
  );

export const vacationsRouter = Router();

vacationsRouter.use(requireAuth);

vacationsRouter.get('/', async (req, res, next) => {
  try {
    const vacations = await listOpenVacations(req.tutorId!);
    res.json({ vacations });
  } catch (err) {
    next(err);
  }
});

vacationsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createVacationSchema, req.body);
    const result = await createVacation(req.tutorId!, body);
    await attachVacationEffects(res, req.tutorId!, result);
    res.status(201).json(result.vacation);
  } catch (err) {
    next(err);
  }
});

vacationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = validate(patchVacationSchema, req.body);
    const result = await patchVacation(req.tutorId!, req.params.id, body);
    await attachVacationEffects(res, req.tutorId!, result);
    res.json(result.vacation);
  } catch (err) {
    next(err);
  }
});

vacationsRouter.post('/:id/return', async (req, res, next) => {
  try {
    const result = await returnFromVacation(req.tutorId!, req.params.id);
    await attachVacationEffects(res, req.tutorId!, result);
    res.json(result.vacation);
  } catch (err) {
    next(err);
  }
});
