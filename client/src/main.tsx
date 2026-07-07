import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Provider } from 'jotai';
import { App } from './App';
import { registerLineMdIcons } from './icons/lineMd';
import './styles.css';

registerLineMdIcons();

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>
);

if (import.meta.env.PROD && root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
