/** Default blocked window: 22:00 – 08:00 (calendar time). */
export const DEFAULT_BLOCK_START_MINUTES = 22 * 60;
export const DEFAULT_BLOCK_END_MINUTES = 8 * 60;

export interface DefaultBlockWindow {
  startMinutes: number;
  endMinutes: number;
}

export const DEFAULT_BLOCK_WINDOW: DefaultBlockWindow = {
  startMinutes: DEFAULT_BLOCK_START_MINUTES,
  endMinutes: DEFAULT_BLOCK_END_MINUTES,
};

export function isDefaultBlocked(
  startMinutes: number,
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean {
  const hour = Math.floor(startMinutes / 60);
  const startHour = Math.floor(window.startMinutes / 60);
  const endHour = Math.floor(window.endMinutes / 60);
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

export interface SlotOverrideRow {
  weekday: number;
  start_minutes: number;
  blocked: boolean;
}

export function defaultBlockedForSlot(
  startMinutes: number,
  hasEvent: boolean,
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean {
  if (hasEvent) return false;
  return isDefaultBlocked(startMinutes, window);
}

export function effectiveSlotBlocked(
  startMinutes: number,
  override: { blocked: boolean } | undefined,
  hasEvent: boolean,
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean {
  if (override) return override.blocked;
  return defaultBlockedForSlot(startMinutes, hasEvent, window);
}

/** After toggle: whether an override row should be stored. */
export function overrideAfterToggle(
  startMinutes: number,
  nextBlocked: boolean,
  hasEvent: boolean,
  window: DefaultBlockWindow = DEFAULT_BLOCK_WINDOW,
): boolean | null {
  const defaultBlocked = defaultBlockedForSlot(startMinutes, hasEvent, window);
  if (nextBlocked === defaultBlocked) return null;
  return nextBlocked;
}
