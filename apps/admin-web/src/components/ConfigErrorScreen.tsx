import { ConfigError } from '../lib/configValidation';

interface Props {
  errors: ConfigError[];
}

export function ConfigErrorScreen({ errors }: Props) {
  const diagRef = 'TORC-' + Math.random().toString(16).slice(2, 10);

  console.error(`[${diagRef}] Configuration errors:`, errors.map(e => e.variable).join(', '));

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
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
      <h2 style={{ color: '#111827', fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
        Configuration Error
      </h2>
      <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 24, maxWidth: 400, lineHeight: 1.6 }}>
        The application cannot start due to missing or invalid configuration.
        Please contact your administrator.
      </p>
      <div style={{
        backgroundColor: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
        maxWidth: 400,
        width: '100%',
      }}>
        {errors.map((err, i) => (
          <div key={i} style={{
            marginBottom: i < errors.length - 1 ? 12 : 0,
            paddingBottom: i < errors.length - 1 ? 12 : 0,
            borderBottom: i < errors.length - 1 ? '1px solid #E5E7EB' : 'none',
          }}>
            <p style={{
              color: '#EF4444',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 4,
              fontFamily: 'monospace',
            }}>
              {err.variable}
            </p>
            <p style={{
              color: '#6B7280',
              fontSize: 12,
              margin: 0,
            }}>
              {err.message}
            </p>
          </div>
        ))}
      </div>
      <p style={{ color: '#D1D5DB', fontSize: 11, marginBottom: 24 }}>
        Reference: {diagRef}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'linear-gradient(to right, #008CE5, #0070B8)',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 12,
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}
