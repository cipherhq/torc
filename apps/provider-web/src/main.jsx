import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { JobProvider } from './context/JobContext';
import { ThemeProvider } from './context/ThemeContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import { LocationProvider } from './context/LocationContext';
import { initSentry } from './lib/sentry';
import './index.css';
import './styles/viewport.css';

initSentry();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <GoogleMapsProvider>
          <AuthProvider>
            <LocationProvider>
              <JobProvider>
                <App />
              </JobProvider>
            </LocationProvider>
          </AuthProvider>
        </GoogleMapsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
