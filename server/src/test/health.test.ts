import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb, teardownTestDb } from './db.js';

describe('GET /health', () => {
  let app: Express;

  beforeAll(async () => {
    await setupTestDb();
    app = await createApp();
  });

  beforeEach(async () => {
    await setupTestDb();
    app = await createApp();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('returns 200 { status: "ok" }', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
