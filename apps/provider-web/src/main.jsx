import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateConfig } from './lib/configValidation';
import './index.css';
import './styles/viewport.css';

const configErrors = validateConfig();
const rootEl = document.getElementById('root');

if (!rootEl) {
  document.body.innerHTML = '<div style="padding:24px;color:red;font-family:sans-serif"><h1>TORC</h1><p>Root element not found. The application cannot start.</p></div>';
} else if (configErrors.length > 0) {
  import('./components/ConfigErrorScreen').then(({ ConfigErrorScreen }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <ConfigErrorScreen errors={configErrors} />
      </StrictMode>
    );
  });
} else {
  Promise.all([
    import('./App'),
    import('./components/ErrorBoundary'),
    import('./context/AuthContext'),
    import('./context/JobContext'),
    import('./context/ThemeContext'),
    import('./context/GoogleMapsContext'),
    import('./context/LocationContext'),
    import('./lib/sentry'),
  ]).then(([
    { default: App },
    { ErrorBoundary },
    { AuthProvider },
    { JobProvider },
    { ThemeProvider },
    { GoogleMapsProvider },
    { LocationProvider },
    { initSentry },
  ]) => {
    initSentry();
    createRoot(rootEl).render(
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
  }).catch((err) => {
    const diagRef = 'TORC-' + Math.random().toString(16).slice(2, 10);
    console.error(`[${diagRef}] App initialization failed:`, err);
    createRoot(rootEl).render(
      <div style={{ minHeight: '100vh', backgroundColor: '#0F1419', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#2EFFAF', fontSize: 36, fontWeight: 'bold', letterSpacing: 4, marginBottom: 24 }}>TORC</h1>
        <h2 style={{ color: '#EF4444', fontSize: 20, marginBottom: 12 }}>Failed to start</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 8 }}>The application could not initialize. Please try reloading.</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 32 }}>Reference: {diagRef}</p>
        <button onClick={() => window.location.reload()} style={{ backgroundColor: '#2EFFAF', color: '#0F1419', border: 'none', borderRadius: 16, padding: '14px 32px', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>Reload</button>
      </div>
    );
  });
}
