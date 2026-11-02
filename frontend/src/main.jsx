import { MotionConfig } from 'motion/react';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './components/components.css';

// Each page loads on its own. Guests opening a bill link never download the
// payer screens, the Supabase client or the QR reader.
const PayerArea = lazy(() => import('./pages/PayerArea.jsx'));
const RequireAuth = lazy(() => import('./lib/auth.jsx').then((m) => ({ default: m.RequireAuth })));
const Home = lazy(() => import('./pages/Home.jsx'));
const AuthPage = lazy(() => import('./pages/auth/AuthPage.jsx'));
const GetPaid = lazy(() => import('./pages/payer/GetPaid.jsx'));
const NewBill = lazy(() => import('./pages/payer/NewBill.jsx'));
const ShareBill = lazy(() => import('./pages/payer/ShareBill.jsx'));
const GuestBill = lazy(() => import('./pages/guest/GuestBill.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* "user": transforms are dropped when the OS asks for reduced motion; fades stay. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense fallback={<div className="state" aria-busy="true" aria-label="Loading" />}>
          <Routes>
            <Route element={<PayerArea />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/signup" element={<AuthPage mode="signup" />} />
              <Route
                path="/get-paid"
                element={
                  <RequireAuth>
                    <GetPaid />
                  </RequireAuth>
                }
              />
              <Route
                path="/bills/new"
                element={
                  <RequireAuth>
                    <NewBill />
                  </RequireAuth>
                }
              />
              <Route
                path="/bills/:id/share"
                element={
                  <RequireAuth>
                    <ShareBill />
                  </RequireAuth>
                }
              />
            </Route>
            <Route path="/b/:shareToken" element={<GuestBill />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
