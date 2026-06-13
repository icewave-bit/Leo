import { getViteMergedEnv } from '../lib/runtimeEnv';

export const landingPageSeo = {
  title: 'LeO — расписание, оплаты и баланс учеников для репетиторов',
  description:
    'LeO помогает репетитору держать расписание, оплаты и баланс учеников под контролем. Уроки, предоплаты, долги, заметки и доход — в одном месте, без Excel.',
} as const;

export function landingPageHeadElements(): Set<{
  type: string;
  props: Record<string, string>;
}> {
  const origin = getViteMergedEnv('VITE_PUBLIC_ORIGIN').replace(/\/$/, '');
  const pageUrl = origin ? `${origin}/` : '/';

  const elements = new Set<{
    type: string;
    props: Record<string, string>;
  }>([
    { type: 'meta', props: { name: 'description', content: landingPageSeo.description } },
    { type: 'meta', props: { name: 'robots', content: 'index, follow' } },
    { type: 'meta', props: { property: 'og:title', content: landingPageSeo.title } },
    { type: 'meta', props: { property: 'og:description', content: landingPageSeo.description } },
    { type: 'meta', props: { property: 'og:type', content: 'website' } },
    { type: 'meta', props: { property: 'og:locale', content: 'ru_RU' } },
    { type: 'meta', props: { name: 'twitter:card', content: 'summary' } },
    { type: 'meta', props: { name: 'twitter:title', content: landingPageSeo.title } },
    { type: 'meta', props: { name: 'twitter:description', content: landingPageSeo.description } },
  ]);

  if (origin) {
    elements.add({ type: 'link', props: { rel: 'canonical', href: pageUrl } });
    elements.add({ type: 'meta', props: { property: 'og:url', content: pageUrl } });
  }

  return elements;
}
