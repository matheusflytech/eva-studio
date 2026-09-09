const NAMESPACE = "eva-agent-studio";

function isBrowser() {
  return typeof window !== "undefined";
}

export function readStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(`${NAMESPACE}:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value));
}

export function clearStorageKey(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(`${NAMESPACE}:${key}`);
}
