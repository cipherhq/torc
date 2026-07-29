import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LocationProvider } from './context/LocationContext';
import { JobProvider } from './context/JobContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import { initSentry } from './lib/sentry';
import "./index.css";
import "./styles/viewport.css";

initSentry();

createRoot(document.getElementById("root")!).render(
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
