import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { validateConfig, renderConfigError } from './lib/configValidation';
import './index.css';

// Validate config before mounting the app
const configResult = validateConfig();
if (!configResult.valid) {
  renderConfigError(configResult.missing);
} else {
  Promise.all([
    import('./routes.jsx'),
    import('./components/ErrorBoundary'),
  ]).then(([
    { router },
    { ErrorBoundary },
  ]) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </StrictMode>
    );
  });
}
