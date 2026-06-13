import { StrictMode } from 'react';
import { Provider } from 'jotai';
import { App } from './App';
import { loginPageHeadElements, loginPageSeo } from './data/loginSeo';
import { landingPageHeadElements, landingPageSeo } from './data/landingSeo';
import './styles.css';

export async function prerender(data: { url: string }) {
  const { renderToString } = await import('react-dom/server');

  const html = renderToString(
    <StrictMode>
      <Provider>
        <App url={data.url} />
      </Provider>
    </StrictMode>,
  );

  const normalizedUrl = data.url.replace(/\/$/, '') || '/';

  if (normalizedUrl === '/') {
    return {
      html,
      head: {
        lang: 'ru',
        title: landingPageSeo.title,
        elements: landingPageHeadElements(),
      },
    };
  }

  if (normalizedUrl === '/login') {
    return {
      html,
      head: {
        lang: 'ru',
        title: loginPageSeo.title,
        elements: loginPageHeadElements(),
      },
    };
  }

  return {
    html,
    head: {
      lang: 'ru',
      title: 'LeO',
    },
  };
}
