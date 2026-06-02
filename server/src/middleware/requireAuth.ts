import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

declare module 'express-session' {
  interface SessionData {
    tutorId?: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const tutorId = req.session?.tutorId;
  if (!tutorId) {
    next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
    return;
  }
  req.tutorId = tutorId;
  next();
};
