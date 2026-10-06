import { Icon as IconifyIcon } from '@iconify/react';
import type { LineMdIconName } from '../icons/lineMd';
import { lineMdIcon } from '../icons/lineMd';

export const VACATION_ICON = 'fluent-mdl2:vacation' as const;

export type AppIconName = LineMdIconName | typeof VACATION_ICON;

export type IconProps = {
  icon: AppIconName;
  size?: number | string;
  className?: string;
  title?: string;
};

export function Icon({ icon, size = 20, className, title }: IconProps) {
  const iconId = icon === VACATION_ICON ? icon : lineMdIcon(icon);
  return (
    <IconifyIcon
      icon={iconId}
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      {...(title ? { 'aria-label': title } : {})}
    />
  );
}

export function GearIcon({ size = 20 }: { size?: number }) {
  return <Icon icon="cog" size={size} />;
}
