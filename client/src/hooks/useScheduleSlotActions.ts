import { useSetAtom } from 'jotai';
import { api } from '../api/client';
import { scheduleSlotOverridesAtom } from '../atoms/schedule';
import { gridDayToCalendarDow } from '../utils/schedule';
import { hourToStartMinutes } from '../utils/scheduleBlocks';

export function useScheduleSlotActions() {
  const setOverrides = useSetAtom(scheduleSlotOverridesAtom);

  const toggleSlotBlock = async (
    gridDay: number,
    hour: number,
    weekStartsOn: 'monday' | 'sunday',
    hasEvent: boolean,
  ): Promise<boolean> => {
    const weekday = gridDayToCalendarDow(gridDay, weekStartsOn);
    const startMinutes = hourToStartMinutes(hour);
    const result = await api.toggleScheduleSlot({ weekday, startMinutes, hasEvent });
    setOverrides(result.overrides);
    return result.blocked;
  };

  return { toggleSlotBlock };
}
