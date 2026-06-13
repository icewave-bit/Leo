import { useEffect } from 'react';

type PageMeta = {
  title: string;
  description?: string;
};

function upsertMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    document.title = title;
    if (description) upsertMeta('description', description);
    upsertMeta('og:title', title, 'property');
    if (description) upsertMeta('og:description', description, 'property');
  }, [title, description]);
}
