import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError } from '../api/client';

/**
 * Owns the competition details resource.
 *
 * Deliberately refetches rather than mutating local state after a write. Seat
 * counts, the viewer action and the countdown are all server-derived and can
 * change because of *other* users; optimistically patching them locally would
 * drift from the truth within seconds. The server response is the single
 * source of truth, and every write returns through here.
 */
export function useCompetition(idOrSlug, locale, { isAuthenticated } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const payload = await api.getCompetition(idOrSlug, locale);
        if (!mounted.current) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', String(err)));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [idOrSlug, locale]
  );

  // Reload when the locale changes or the user signs in/out - both change what
  // the server returns for this same resource.
  useEffect(() => {
    load();
  }, [load, isAuthenticated]);

  /**
   * Re-sync on foreground. A screen left open for an hour has a stale seat
   * count and possibly a closed registration window; showing the user a
   * Register button that the server will reject is worse than a brief refetch.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load({ silent: true });
    });
    return () => sub.remove();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load({ silent: true });
  }, [load]);

  return { data, loading, refreshing, error, refresh, reload: load };
}
