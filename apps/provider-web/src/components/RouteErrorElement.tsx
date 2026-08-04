import { useRouteError } from 'react-router';

export function RouteErrorElement() {
  const error = useRouteError();
  const diagRef = 'TORC-' + Math.random().toString(16).slice(2, 10);

  console.error(`[${diagRef}] Route error:`, error);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0F1419',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <h1 style={{ color: '#2EFFAF', fontSize: 36, fontWeight: 'bold', letterSpacing: 4, marginBottom: 24 }}>TORC</h1>
      <h2 style={{ color: '#EF4444', fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>Page Error</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 8, maxWidth: 400, lineHeight: 1.5 }}>
        This page encountered an error. Your data has not been lost.
      </p>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 32 }}>Reference: {diagRef}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => window.location.reload()} style={{
          backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 16, padding: '14px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>Retry</button>
        <button onClick={() => { window.location.href = '/home'; }} style={{
          backgroundColor: '#2EFFAF', color: '#0F1419', border: 'none',
          borderRadius: 16, padding: '14px 24px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        }}>Go Home</button>
      </div>
    </div>
  );
}
