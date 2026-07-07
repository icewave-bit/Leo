import { Icon as IconifyIcon } from '@iconify/react';
import type { LineMdIconName } from '../icons/lineMd';
import { lineMdIcon } from '../icons/lineMd';

export type IconProps = {
  icon: LineMdIconName;
  size?: number | string;
  className?: string;
  title?: string;
};

export function Icon({ icon, size = 20, className, title }: IconProps) {
  return (
    <IconifyIcon
      icon={lineMdIcon(icon)}
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
