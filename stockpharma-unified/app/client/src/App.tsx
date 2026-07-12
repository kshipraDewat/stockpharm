import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import QueryProvider from './providers/QueryProvider';
import AppRoutes from './routes';
import SessionExpiredRedirect from './components/auth/SessionExpiredRedirect';

export default function App() {
  return (
    <QueryProvider>
      <Toaster position="top-right" />
      <BrowserRouter>
        <SessionExpiredRedirect />
        <AppRoutes />
      </BrowserRouter>
    </QueryProvider>
  );
}
