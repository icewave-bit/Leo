import { randomBytes } from 'node:crypto';

const LINK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Short uppercase alphanumeric code (excludes ambiguous 0/O/1/I). */
export function generateTelegramLinkCode(byteCount = 6): string {
  const buf = randomBytes(byteCount);
  let out = '';
  for (const b of buf) {
    out += LINK_ALPHABET[b % LINK_ALPHABET.length]!;
  }
  return out;
}

export const TELEGRAM_LINK_CODE_TTL_MS = 10 * 60 * 1000;
