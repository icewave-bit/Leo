import { useEffect } from 'react';

export function useScrollReveal(rootSelector = '.landing') {
  useEffect(() => {
    const pending = new Set(
      document.querySelectorAll<HTMLElement>(`${rootSelector} .reveal`),
    );

    Array.from(pending).forEach((el, i) => {
      el.style.transitionDelay = `${(Math.min(i % 3, 2) * 0.07).toFixed(2)}s`;
    });

    const check = () => {
      const h = window.innerHeight || document.documentElement.clientHeight;
      for (const el of [...pending]) {
        if (el.getBoundingClientRect().top < h - 60) {
          el.classList.add('in');
          pending.delete(el);
        }
      }
    };

    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    window.addEventListener('load', check);

    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      window.removeEventListener('load', check);
    };
  }, [rootSelector]);
}
