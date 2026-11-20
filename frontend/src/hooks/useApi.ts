import { useEffect, useRef, useState } from 'react';

/**
 * Generic data-fetching hook with loading / error / data states and a
 * refresh mechanism. Falls back to a provided value on failure so screens
 * remain usable even if the API is unreachable (marked as offline source).
 */
export function useApi<T>(fetcher: () => Promise<T>, fallback: T, deps: unknown[] = []) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'api' | 'offline'>('api');
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  const silentRefresh = useRef(false);

  /**
   * Re-fetch data. Pass `true` for background polling so the UI keeps showing
   * the current rows instead of flashing a loading skeleton every few seconds.
   */
  const refresh = (silent = false) => {
    silentRefresh.current = silent;
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const isSilent = silentRefresh.current;
    silentRefresh.current = false;
    if (!isSilent) setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (cancelled || !mounted.current) return;
        setData(result);
        setSource('api');
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return;
        setData(fallback);
        setSource('offline');
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return { data, loading, error, source, refresh };
}
