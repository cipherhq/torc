import { useCallback, useRef, useState } from 'react';

/**
 * Wraps an async function to prevent duplicate concurrent calls.
 * Returns [wrappedFn, isRunning] — the wrapped function is a no-op
 * while a previous invocation is still in flight.
 *
 * The useRef ensures that even if React batches state updates,
 * the guard is synchronously checked.
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  fn: T
): [(...args: Parameters<T>) => Promise<ReturnType<T> | undefined>, boolean] {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const wrapped = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      if (runningRef.current) return undefined;
      runningRef.current = true;
      setRunning(true);
      try {
        return await fn(...args);
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [fn]
  );

  return [wrapped, running];
}
