import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './routes.jsx';
import { AuthProvider } from './context/AuthContext';
import { JobProvider } from './context/JobContext';
import { ThemeProvider } from './context/ThemeContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <GoogleMapsProvider>
        <AuthProvider>
          <JobProvider>
            <RouterProvider router={router} />
          </JobProvider>
        </AuthProvider>
      </GoogleMapsProvider>
    </ThemeProvider>
  </StrictMode>
);
