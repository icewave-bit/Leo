import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfigCache } from '../config.js';

describe('config', () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it('throws when a required env var is missing', () => {
    expect(() =>
      loadConfig({
        PORT: '3001',
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        CORS_ORIGIN: 'http://127.0.0.1:5173',
        SESSION_SECRET: '',
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
