import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateConfig } from './lib/configValidation';
import './index.css';

const configErrors = validateConfig();
const rootEl = document.getElementById('root');

if (!rootEl) {
  document.body.innerHTML =
    '<div style="padding:24px;color:#EF4444;font-family:sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column">' +
    '<h1 style="color:#008CE5">TORC Admin</h1>' +
    '<p>Root element not found. The application cannot start.</p></div>';
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
    import('react-router'),
    import('./routes.jsx'),
    import('./components/ErrorBoundary'),
  ]).then(([
    { RouterProvider },
    { router },
    { ErrorBoundary },
  ]) => {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </StrictMode>
    );
  }).catch((err) => {
    const diagRef = 'TORC-' + Math.random().toString(16).slice(2, 10);
    console.error(`[${diagRef}] App initialization failed:`, err);
    createRoot(rootEl).render(
      <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #008CE5, #0070B8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <span style={{ color: '#FFF', fontSize: 28, fontWeight: 'bold' }}>!</span>
        </div>
        <h2 style={{ color: '#111827', fontSize: 20, marginBottom: 12 }}>Failed to start</h2>
        <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 8 }}>The application could not initialize. Please try reloading.</p>
        <p style={{ color: '#D1D5DB', fontSize: 11, marginBottom: 32 }}>Reference: {diagRef}</p>
        <button onClick={() => window.location.reload()} style={{ background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>Reload</button>
      </div>
    );
  });
}
