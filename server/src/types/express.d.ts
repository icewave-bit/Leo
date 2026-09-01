import 'express-session';
import type { ActivitySnapshot } from '../activityLog.js';

declare global {
  namespace Express {
    interface Request {
      tutorId?: string;
      studentId?: string;
      botRole?: 'tutor' | 'student';
      activitySnapshot?: ActivitySnapshot;
    }
  }
}

export {};
