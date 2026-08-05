import { useId, useState, type ReactNode } from 'react';

export function DrawerSpoiler({
  title,
  children,
  className,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={
        'drawer-spoiler' +
        (open ? ' is-open' : '') +
        (className ? ` ${className}` : '')
      }
    >
      <button
        type="button"
        className="drawer-spoiler__summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="drawer-spoiler__title">{title}</span>
      </button>
      <div
        id={panelId}
        className="drawer-spoiler__collapse"
        role="region"
        aria-label={title}
        inert={open ? undefined : true}
      >
        <div className="drawer-spoiler__collapse-inner">
          <div className="drawer-spoiler__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
