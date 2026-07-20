import 'express-session';

declare global {
  namespace Express {
    interface Request {
      tutorId?: string;
      studentId?: string;
      botRole?: 'tutor' | 'student';
    }
  }
}

export {};
