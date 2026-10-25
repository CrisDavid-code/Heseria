import { useEffect, useSyncExternalStore, type ReactNode } from "react";

/**
 * Per-screen chrome. Each page declares what the top bar should show, the way
 * a native screen configures its navigation item.
 */
export interface ScreenConfig {
  /** Title shown in the top bar. Empty on the home tab, which shows the wordmark. */
  title: string;
  /** Show a back chevron instead of the account avatar. */
  back: boolean;
  /** Hide the segmented sub-navigation (detail screens, players, chat). */
  hideSections: boolean;
  /** Hide the whole top bar (immersive screens: full player, video, call). */
  immersive: boolean;
  /** Contextual actions rendered on the right. */
  actions: ReactNode;
}

const DEFAULT: ScreenConfig = {
  title: "",
  back: false,
  hideSections: false,
  immersive: false,
  actions: null,
};

let state: ScreenConfig = DEFAULT;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useScreenConfig(): ScreenConfig {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/**
 * Declares this screen's top bar. Resets to the default on unmount so the next
 * screen never inherits stale chrome.
 */
export function useScreen(config: Partial<ScreenConfig>, deps: unknown[] = []) {
  const { title, back, hideSections, immersive } = config;
  useEffect(() => {
    state = { ...DEFAULT, ...config };
    emit();
    return () => {
      state = DEFAULT;
      emit();
    };
    // `actions` is intentionally excluded: JSX is a new object every render.
    // Pass a dep when actions depend on changing values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, back, hideSections, immersive, ...deps]);
}
