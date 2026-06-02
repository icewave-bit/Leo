import 'dotenv/config';

process.env.NODE_ENV = 'test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
