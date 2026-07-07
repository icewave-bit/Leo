import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BLOCK_WINDOW,
  defaultBlockedForSlot,
  isDefaultBlocked,
  overrideAfterToggle,
} from '../scheduleBlocks.js';

describe('scheduleBlocks', () => {
  it('blocks overnight default window', () => {
    expect(isDefaultBlocked(22 * 60, DEFAULT_BLOCK_WINDOW)).toBe(true);
    expect(isDefaultBlocked(23 * 60, DEFAULT_BLOCK_WINDOW)).toBe(true);
    expect(isDefaultBlocked(7 * 60, DEFAULT_BLOCK_WINDOW)).toBe(true);
    expect(isDefaultBlocked(12 * 60, DEFAULT_BLOCK_WINDOW)).toBe(false);
  });

  it('blocks same-day window', () => {
    const window = { startMinutes: 13 * 60, endMinutes: 17 * 60 };
    expect(isDefaultBlocked(12 * 60, window)).toBe(false);
    expect(isDefaultBlocked(13 * 60, window)).toBe(true);
    expect(isDefaultBlocked(16 * 60, window)).toBe(true);
    expect(isDefaultBlocked(17 * 60, window)).toBe(false);
  });

  it('treats equal start and end as no default blocking', () => {
    const window = { startMinutes: 22 * 60, endMinutes: 22 * 60 };
    expect(isDefaultBlocked(22 * 60, window)).toBe(false);
    expect(isDefaultBlocked(8 * 60, window)).toBe(false);
  });

  it('keeps event slots open by default', () => {
    expect(defaultBlockedForSlot(22 * 60, true, DEFAULT_BLOCK_WINDOW)).toBe(false);
    expect(defaultBlockedForSlot(22 * 60, false, DEFAULT_BLOCK_WINDOW)).toBe(true);
  });

  it('stores override only when different from default', () => {
    expect(overrideAfterToggle(22 * 60, false, false, DEFAULT_BLOCK_WINDOW)).toBe(false);
    expect(overrideAfterToggle(22 * 60, true, false, DEFAULT_BLOCK_WINDOW)).toBe(null);
    expect(overrideAfterToggle(12 * 60, true, false, DEFAULT_BLOCK_WINDOW)).toBe(true);
    expect(overrideAfterToggle(12 * 60, false, false, DEFAULT_BLOCK_WINDOW)).toBe(null);
  });
});
