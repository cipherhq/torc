import { useRouteError } from 'react-router';

export function RouteErrorElement() {
  const error = useRouteError();
  const diagRef = 'TORC-' + Math.random().toString(16).slice(2, 10);

  console.error(`[${diagRef}] Route error:`, error);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#FFFFFF',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg, #008CE5, #0070B8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <span style={{ color: '#FFF', fontSize: 28, fontWeight: 'bold' }}>!</span>
      </div>
      <h2 style={{ color: '#111827', fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>Page Error</h2>
      <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 8, maxWidth: 400, lineHeight: 1.6 }}>
        This page encountered an error. Your data has not been lost.
      </p>
      <p style={{ color: '#D1D5DB', fontSize: 11, marginBottom: 32 }}>Reference: {diagRef}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => window.location.reload()} style={{
          backgroundColor: '#F3F4F6', color: '#374151', border: 'none',
          borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>Retry</button>
        <button onClick={() => { window.location.href = '/dashboard'; }} style={{
          background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', border: 'none',
          borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        }}>Go to Dashboard</button>
      </div>
    </div>
  );
}
