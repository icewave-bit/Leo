import 'dotenv/config';

process.env.NODE_ENV = 'test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BOT_API_TOKEN ??= 'test-bot-api-token-16';
