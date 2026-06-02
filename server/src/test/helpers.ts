import type { Express } from 'express';
import request from 'supertest';

export interface AuthSession {
  agent: request.Agent;
  tutorId: string;
  email: string;
}

export async function registerTutor(
  app: Express,
  overrides?: Partial<{ email: string; password: string; name: string; timezone: string }>,
): Promise<AuthSession> {
  const email = overrides?.email ?? `tutor-${crypto.randomUUID()}@test.com`;
  const password = overrides?.password ?? 'password123';
  const name = overrides?.name ?? 'Test Tutor';
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({
      email,
      password,
      name,
      timezone: overrides?.timezone ?? 'UTC',
    })
    .expect(201);

  return {
    agent,
    tutorId: res.body.tutor.id as string,
    email,
  };
}
