type Listener = () => void;

const startListeners = new Set<Listener>();

/** Subscribe to programmatic / link-driven navigation starts. */
export function onNavigationStart(listener: Listener): () => void {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

/** Call before `router.push` / `router.replace` so the top progress bar can start. */
export function signalNavigationStart(): void {
  startListeners.forEach((listener) => listener());
}
