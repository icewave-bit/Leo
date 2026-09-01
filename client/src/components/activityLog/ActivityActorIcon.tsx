import { Icon as IconifyIcon } from '@iconify/react';
import type { ActivityActor } from '../../api/types';
import { ACTOR_LABELS } from '../../utils/activityLog';

const ACTOR_ICONS: Record<ActivityActor, string> = {
  user: 'mdi-light:account',
  system: 'line-md:cog-loop',
  bot: 'line-md:telegram',
};

export function ActivityActorIcon({
  actor,
  size = 22,
}: {
  actor: ActivityActor;
  size?: number;
}) {
  return (
    <IconifyIcon
      icon={ACTOR_ICONS[actor]}
      width={size}
      height={size}
      aria-label={ACTOR_LABELS[actor]}
    />
  );
}
