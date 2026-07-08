import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import type { PersonalEventGroup } from '../api/types';
import { personalEventGroupsAtom } from '../atoms/schedule';

export function usePersonalEventGroupMap(): Map<string, PersonalEventGroup> {
  const groups = useAtomValue(personalEventGroupsAtom);
  return useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
}
