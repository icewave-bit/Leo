import 'express-session';

declare module 'express-serve-static-core' {
  interface Request {
    tutorId?: string;
  }
}
