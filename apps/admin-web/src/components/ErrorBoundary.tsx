import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
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
            Something went wrong
          </h2>
          <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 8, maxWidth: 400, lineHeight: 1.6 }}>
            An unexpected error occurred. You can try reloading the page or going back to the dashboard.
          </p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 32, maxWidth: 400, textAlign: 'center', wordBreak: 'break-word' }}>
            {this.state.error?.message}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleGoHome}
              style={{
                backgroundColor: '#F3F4F6', color: '#374151', border: 'none',
                borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Dashboard
            </button>
            <button
              onClick={this.handleReload}
              style={{
                background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF', border: 'none',
                borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
