import { describe, it, expect } from 'vitest';
import { deriveInitials, hashPassword, verifyPassword } from '../auth/password.js';

describe('password', () => {
  it('deriveInitials from one and two words', () => {
    expect(deriveInitials('Anna')).toBe('AN');
    expect(deriveInitials('Anna Petrova')).toBe('AP');
  });

  it('hashes and verifies password', async () => {
    const hash = await hashPassword('password123');
    expect(await verifyPassword(hash, 'password123')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
