/** Strip @, trim, empty → null. Does not validate characters. */
export function normalizeTelegramUsername(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.trim().replace(/^@+/, '');
  return cleaned === '' ? null : cleaned;
}
