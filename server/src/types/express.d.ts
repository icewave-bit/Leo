import 'express-session';

declare global {
  namespace Express {
    interface Request {
      tutorId?: string;
    }
  }
}

export {};
