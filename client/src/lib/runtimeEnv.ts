/** Build-time (import.meta.env) + runtime (window._env_ из env-driven-static-server). */
export function getViteMergedEnv(key: string): string {
  const fromBuild = (import.meta.env as Record<string, string | boolean | undefined>)[key];
  if (fromBuild !== undefined && fromBuild !== null && String(fromBuild).trim() !== '') {
    return String(fromBuild).trim();
  }
  if (typeof window === 'undefined') return '';
  const fromWindow = window._env_?.[key];
  if (fromWindow === undefined || fromWindow === null) return '';
  return String(fromWindow).trim();
}
