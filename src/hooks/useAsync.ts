/**
 * HESERIA — The hook layer between pages and services.
 *
 * Pages call hooks; hooks call services; services return typed promises.
 * No page imports from src/mocks. Swapping mocks for HTTP changes nothing here.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * Runs `fn` on mount and whenever `deps` change.
 * Stale responses are discarded, so fast filter changes cannot race.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);

  // The caller owns the dependency list; `fn` is intentionally not a dep.
  const run = useCallback(fn, deps);

  useEffect(() => {
    const id = ++runId.current;
    let alive = true;
    setLoading(true);
    setError(undefined);

    run()
      .then((result) => {
        if (!alive || id !== runId.current) return;
        setData(result);
      })
      .catch((e: unknown) => {
        if (!alive || id !== runId.current) return;
        setError(e instanceof Error ? e : new Error("Error inesperado"));
      })
      .finally(() => {
        if (!alive || id !== runId.current) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [run, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}

/**
 * For actions the user triggers (submit, enroll, donate).
 * Exposes the pending flag so buttons can disable and show a spinner.
 */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const execute = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setPending(true);
      setError(undefined);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e instanceof Error ? e : new Error("Error inesperado"));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { execute, pending, error, clearError: () => setError(undefined) };
}
