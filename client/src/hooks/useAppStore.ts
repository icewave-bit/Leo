import { useStore } from 'jotai';

/** Store from the root `<Provider>` — not `getDefaultStore()`, which is a separate instance. */
export function useAppStore() {
  return useStore();
}
