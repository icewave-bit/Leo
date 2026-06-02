import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadConfig(overrides?: Partial<Record<string, string>>): Env {
  if (cached && !overrides) return cached;
  const source = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }
  if (!overrides) cached = parsed.data;
  return parsed.data;
}

export function resetConfigCache(): void {
  cached = null;
}
