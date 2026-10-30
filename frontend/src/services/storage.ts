/**
 * Browser storage wrappers. Storage can be unavailable (private windows, blocked site data) or
 * full; every access is guarded and the app keeps working in memory.
 */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false if the value could not be stored. */
export function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const STORAGE_KEYS = {
  theme: 'lockscope.theme',
  engineUrl: 'lockscope.engineUrl',
  datasets: 'lockscope.datasets.v1',
  sidebar: 'lockscope.sidebarCollapsed',
  engineOptIn: 'lockscope.engineOptIn',
} as const;
