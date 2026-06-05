import { useLayoutEffect, useState, type RefObject } from 'react';
import { WG_PX_PER_HOUR, WG_PX_PER_HOUR_MOBILE } from '../constants/weekGrid';

/** On mobile, scale hour rows so exactly `fitVisibleHours` fit in the scroll viewport. */
export function useWeekGridPxPerHour(
  scrollRef: RefObject<HTMLDivElement | null>,
  fitVisibleHours: number | null,
): number {
  const [mobilePx, setMobilePx] = useState(WG_PX_PER_HOUR_MOBILE);

  useLayoutEffect(() => {
    if (fitVisibleHours == null) return;

    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const height = el.clientHeight;
      if (height > 0) setMobilePx(height / fitVisibleHours);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [scrollRef, fitVisibleHours]);

  if (fitVisibleHours == null) return WG_PX_PER_HOUR;
  return mobilePx;
}
