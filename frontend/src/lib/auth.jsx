import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { cachedProfile, clearPayerCache, setTokenSource } from './api.js';
import { clearNewBill } from './newBillStore.js';
import { supabase } from './supabase.js';

const AuthContext = createContext({ session: undefined });

// Payer API calls carry the current access token (refreshed by supabase-js).
setTokenSource(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);

/** Holds the payer's Supabase session. `session` is undefined while loading, null when logged out. */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Never show one payer's remembered data to the next one on this device. SIGNED_IN
      // also fires on coming back to the tab (after the camera): clear only for another account.
      if (event === 'SIGNED_OUT') {
        clearPayerCache();
        clearNewBill();
      }
      if (event === 'SIGNED_IN' && cachedProfile() && cachedProfile().email !== next?.user?.email) clearPayerCache();
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Sends logged-out visitors to the log-in page, then back here afterwards. */
export function RequireAuth({ children }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session === undefined) return <main className="state on-night" aria-busy="true" aria-label="Loading" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Friendly messages for Supabase auth errors. */
export function authErrorMessage(error) {
  const messages = {
    invalid_credentials: 'Login failed. Check your credentials or sign up.',
    user_already_exists: 'An account with this email already exists. Log in instead.',
    email_exists: 'An account with this email already exists. Log in instead.',
    weak_password: 'Choose a longer password: at least 8 characters.',
    email_not_confirmed: 'Confirm your email first: open the link we sent you.',
    over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
    over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
    signup_disabled: 'New accounts are turned off for now.',
    validation_failed: 'Check your email address and try again.',
  };
  if (error?.code && messages[error.code]) return messages[error.code];
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
    return "You're offline. Check your connection and try again.";
  }
  return 'Something went wrong. Try again.';
}
