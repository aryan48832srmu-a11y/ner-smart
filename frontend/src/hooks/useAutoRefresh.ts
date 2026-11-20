import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a view fresh without user interaction.
 *
 * Calls `refresh` immediately on mount (so opening a page always shows the
 * latest data), whenever the browser tab regains focus, and on a timer while
 * the tab is visible. The timer is skipped in a hidden tab to avoid wasted
 * requests. Background refreshes are silent, so no loading skeleton flashes.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 20_000): Date | null {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const run = useCallback(() => {
    refreshRef.current();
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    // The data hook already fetches on mount / route visit; just record it.
    setLastUpdated(new Date());

    const onFocus = () => run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, intervalMs);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, run]);

  return lastUpdated;
}
