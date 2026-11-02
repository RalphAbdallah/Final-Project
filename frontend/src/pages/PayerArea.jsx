import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../lib/auth.jsx';

/** Wraps every payer page in the Supabase session. Guest pages never load this. */
export default function PayerArea() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
