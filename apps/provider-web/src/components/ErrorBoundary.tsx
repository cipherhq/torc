import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
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

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#0F1419',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <h1
            style={{
              color: '#2EFFAF',
              fontSize: 36,
              fontWeight: 'bold',
              letterSpacing: 4,
              marginBottom: 24,
            }}
          >
            TORC
          </h1>
          <h2
            style={{
              color: '#EF4444',
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 12,
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 32,
              maxWidth: 400,
              lineHeight: 1.5,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReload}
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
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
