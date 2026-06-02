import { useEffect, useState } from 'react';

export function useMobile(): boolean {
  const [m, setM] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)');
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}
