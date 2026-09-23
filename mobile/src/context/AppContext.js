import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { getStrings } from '../i18n/strings';

const AppContext = createContext(null);

/**
 * Holds the two pieces of state that sit above the screen: the signed-in user
 * and the active locale.
 *
 * The token lives in memory only. A production build would persist it in
 * expo-secure-store (Keychain / Keystore) - AsyncStorage is plaintext and the
 * wrong place for a credential - but persistence adds nothing demonstrable
 * here, so the seam is left explicit rather than half-done.
 */
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [locale, setLocale] = useState('en');
  const [signingIn, setSigningIn] = useState(false);

  const signIn = useCallback(async (email = 'demo@feedants.test') => {
    setSigningIn(true);
    try {
      const { token, user: signedIn } = await api.devLogin(email);
      setAuthToken(token);
      setUser(signedIn);
      setLocale(signedIn.locale || 'en');
      return signedIn;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale((current) => (current === 'en' ? 'hi' : 'en'));
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signingIn,
      signIn,
      signOut,
      locale,
      setLocale,
      toggleLocale,
      t: getStrings(locale),
    }),
    [user, signingIn, signIn, signOut, locale, toggleLocale]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
