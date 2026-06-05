/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Runtime env из env-config.js (Docker: ghcr.io/pkarpovich/env-driven-static-server). */
interface Window {
  _env_?: Record<string, string>;
}
