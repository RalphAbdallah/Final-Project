import { MotionConfig } from 'motion/react';
import LoadingScreen from './components/Loading.jsx';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createRoutesFromElements, Outlet, Route, RouterProvider } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './components/components.css';
// Before the router is created: its back/forward listener must run after this one.
import './lib/stack.jsx';

// Each page loads on its own. Guests opening a bill link never download the
// payer screens, the Supabase client or the QR reader.
const PayerArea = lazy(() => import('./pages/PayerArea.jsx'));
const RequireAuth = lazy(() => import('./lib/auth.jsx').then((m) => ({ default: m.RequireAuth })));
const Home = lazy(() => import('./pages/Home.jsx'));
const AuthPage = lazy(() => import('./pages/auth/AuthPage.jsx'));
const GetPaid = lazy(() => import('./pages/payer/GetPaid.jsx'));
const NewBill = lazy(() => import('./pages/payer/NewBill.jsx'));
const ShareBill = lazy(() => import('./pages/payer/ShareBill.jsx'));
const BillScreen = lazy(() => import('./pages/payer/BillScreen.jsx'));
const EditBill = lazy(() => import('./pages/payer/EditBill.jsx'));
const Profile = lazy(() => import('./pages/payer/Profile.jsx'));
const GuestBill = lazy(() => import('./pages/guest/GuestBill.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/** Every page inside one Suspense: a page's code arriving shows the spinner. */
function Root() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Outlet />
    </Suspense>
  );
}

// A data router (not <BrowserRouter>): it's what runs navigations as view transitions,
// so pages can stack (lib/stack.jsx).
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Root />}>
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
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/bills/:id"
          element={
            <RequireAuth>
              <BillScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/bills/:id/edit"
          element={
            <RequireAuth>
              <EditBill />
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
    </Route>,
  ),
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* "user": transforms are dropped when the OS asks for reduced motion; fades stay. */}
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
);
