import { RouterProvider } from 'react-router';
import { router } from './routes.jsx';
import { NotificationToastProvider } from './components/NotificationToast';
import { OfflineBanner } from './components/OfflineBanner';

export default function App() {
  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
      <NotificationToastProvider />
    </>
  );
}
