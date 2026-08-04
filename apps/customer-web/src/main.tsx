import { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { validateConfig, renderConfigError } from './lib/configValidation';
import "./index.css";
import "./styles/viewport.css";

// Validate config before mounting the app
const configResult = validateConfig();
if (!configResult.valid) {
  renderConfigError(configResult.missing);
} else {
  // Only import app modules after config is validated
  Promise.all([
    import('./App.tsx'),
    import('./context/ThemeContext'),
    import('./context/AuthContext'),
    import('./context/LocationContext'),
    import('./context/JobContext'),
    import('./context/GoogleMapsContext'),
    import('./components/ErrorBoundary'),
  ]).then(([
    { default: App },
    { ThemeProvider },
    { AuthProvider },
    { LocationProvider },
    { JobProvider },
    { GoogleMapsProvider },
    { ErrorBoundary },
  ]) => {
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
  });
}
