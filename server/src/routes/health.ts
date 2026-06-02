import { Router } from 'express';
import { query } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});
