import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { NotificationToastProvider } from './components/NotificationToast';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <NotificationToastProvider />
    </>
  );
}
