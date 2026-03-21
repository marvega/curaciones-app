import '@testing-library/jest-dom';

// Node 22+ ships a built-in localStorage that shadows jsdom's Web Storage API.
// Provide a spec-compliant in-memory shim so tests can use getItem/setItem/removeItem/clear.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: storage, writable: true, configurable: true });
  }
}
