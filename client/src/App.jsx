import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import LoadingScreen from './components/Loading.jsx';
import { RequireAuth } from './auth/AuthContext.jsx';
import AuthPage from './pages/auth/AuthPage.jsx'; // always loaded: locked pages show it

// Load the page you're on (Session 22): each page's code arrives only when it's opened,
// so a guest opening a bill link never downloads the payer's screens.
const Home = lazy(() => import('./pages/Home.jsx'));
const GetPaid = lazy(() => import('./pages/payer/GetPaid.jsx'));
const NewBill = lazy(() => import('./pages/payer/NewBill.jsx'));
const ShareBill = lazy(() => import('./pages/payer/ShareBill.jsx'));
const BillScreen = lazy(() => import('./pages/payer/BillScreen.jsx'));
const EditBill = lazy(() => import('./pages/payer/EditBill.jsx'));
const Profile = lazy(() => import('./pages/payer/Profile.jsx'));
const GuestBill = lazy(() => import('./pages/guest/GuestBill.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// A page that needs a login (the payer's screens).
const locked = (page) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/get-paid" element={locked(<GetPaid />)} />
        <Route path="/profile" element={locked(<Profile />)} />
        <Route path="/bills/new" element={locked(<NewBill />)} />
        <Route path="/bills/:id" element={locked(<BillScreen />)} />
        <Route path="/bills/:id/edit" element={locked(<EditBill />)} />
        <Route path="/bills/:id/share" element={locked(<ShareBill />)} />
        {/* Guests: no account, the link's token is enough */}
        <Route path="/b/:shareToken" element={<GuestBill />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
