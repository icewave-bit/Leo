import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf-8')) as {
  version: string;
};

function sitemapPlugin(origin: string): Plugin {
  return {
    name: 'sitemap',
    closeBundle() {
      if (!origin) return;
      const base = origin.replace(/\/$/, '');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
  </url>
  <url>
    <loc>${base}/login</loc>
  </url>
</urlset>
`;
      const distDir = path.join(rootDir, 'dist');
      writeFileSync(path.join(distDir, 'sitemap.xml'), xml, 'utf-8');

      const robotsPath = path.join(distDir, 'robots.txt');
      const robots = readFileSync(path.join(rootDir, 'public', 'robots.txt'), 'utf-8').trimEnd();
      writeFileSync(
        robotsPath,
        `${robots}\n\nSitemap: ${base}/sitemap.xml\n`,
        'utf-8',
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001';
  const publicOrigin = env.VITE_PUBLIC_ORIGIN?.trim() ?? '';

  return {
    plugins: [
      react(),
      vitePrerenderPlugin({
        renderTarget: '#root',
        prerenderScript: path.join(rootDir, 'src/prerender.tsx'),
        additionalPrerenderRoutes: ['/login'],
      }),
      sitemapPlugin(publicOrigin),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: apiTarget
        ? {
            '/api': { target: apiTarget, changeOrigin: true },
            '/health': { target: apiTarget, changeOrigin: true },
          }
        : undefined,
    },
  };
});
