import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearPayerCache } from '../api/client.js';
import { clearNewBill } from '../utils/newBillStore.js';
import AuthPage from '../pages/auth/AuthPage.jsx';

// Who's logged in is state: one provider, any component can read it (Session 15, 20).
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // localStorage survives a refresh; useState re-renders. Keep both in sync.
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  function start(data) {
    clearPayerCache(); // never show one payer's remembered data to the next one
    localStorage.setItem('token', data.token);
    setToken(data.token);
  }

  async function login(email, password) {
    start(await api.login(email, password));
  }

  async function signup(name, email, password) {
    start(await api.signup(name, email, password));
  }

  function logout() {
    localStorage.removeItem('token');
    clearPayerCache();
    clearNewBill();
    setToken(null);
  }

  // The server said the token is no longer good (apiFetch fires this on a 401): log out.
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, []);

  return <AuthContext.Provider value={{ token, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// A protected page: logged out, it shows the log-in form in its place.
// Once logged in, this re-renders and the page appears (Session 20, "App gates on the token").
export function RequireAuth({ children }) {
  const { token } = useAuth();
  if (!token) return <AuthPage mode="login" stay />;
  return children;
}

// The server's error codes, in the app's words.
export function authErrorMessage(err) {
  const messages = {
    invalid_credentials: 'Login failed. Check your credentials or sign up.',
    email_taken: 'An account with this email already exists. Log in instead.',
    weak_password: 'Choose a longer password: at least 8 characters.',
    invalid_email: 'Check your email address and try again.',
  };
  if (messages[err.code]) return messages[err.code];
  // Too many tries (server/middleware/rateLimits.js): say how long to wait, in minutes.
  if (err.code === 'too_many_requests') {
    const minutes = Math.max(1, Math.ceil((err.data.retryAfter || 60) / 60));
    return `Too many tries. Try again in ${minutes === 1 ? '1 minute' : `${minutes} minutes`}.`;
  }
  if (err.code === 'offline') return "You're offline. Check your connection and try again.";
  return 'Something went wrong. Try again.';
}
