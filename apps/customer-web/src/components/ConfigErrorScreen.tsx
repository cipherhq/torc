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
      backgroundColor: '#0F1419',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <h1 style={{
        color: '#2EFFAF',
        fontSize: 36,
        fontWeight: 'bold',
        letterSpacing: 4,
        marginBottom: 24,
      }}>
        TORC
      </h1>
      <h2 style={{
        color: '#EF4444',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 12,
      }}>
        Configuration Error
      </h2>
      <p style={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        maxWidth: 400,
        lineHeight: 1.5,
      }}>
        The application cannot start due to missing or invalid configuration.
        Please contact your administrator.
      </p>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
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
            borderBottom: i < errors.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
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
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: 12,
              margin: 0,
            }}>
              {err.message}
            </p>
          </div>
        ))}
      </div>
      <p style={{
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 12,
        marginBottom: 24,
      }}>
        Reference: {diagRef}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          backgroundColor: '#2EFFAF',
          color: '#0F1419',
          border: 'none',
          borderRadius: 16,
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}
