import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { validateConfig, renderConfigError } from './lib/configValidation';
import './index.css';
import './styles/viewport.css';

// Validate config before mounting the app
const configResult = validateConfig();
if (!configResult.valid) {
  renderConfigError(configResult.missing);
} else {
  Promise.all([
    import('./routes.jsx'),
    import('./context/AuthContext'),
    import('./context/JobContext'),
    import('./context/ThemeContext'),
    import('./context/GoogleMapsContext'),
    import('./components/ErrorBoundary'),
  ]).then(([
    { router },
    { AuthProvider },
    { JobProvider },
    { ThemeProvider },
    { GoogleMapsProvider },
    { ErrorBoundary },
  ]) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <GoogleMapsProvider>
              <AuthProvider>
                <JobProvider>
                  <RouterProvider router={router} />
                </JobProvider>
              </AuthProvider>
            </GoogleMapsProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </StrictMode>
    );
  });
}
