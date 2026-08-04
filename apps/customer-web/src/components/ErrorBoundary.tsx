import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  diagRef: string;
}

function generateDiagRef(): string {
  return 'TORC-' + Math.random().toString(16).slice(2, 10);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, diagRef: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, diagRef: generateDiagRef() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.state.diagRef}] ErrorBoundary caught:`, error.message, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, diagRef: '' });
  };

  handleGoHome = () => {
    window.location.href = '/customer/home';
  };

  handleSignIn = () => {
    window.location.href = '/login';
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
              marginBottom: 8,
              maxWidth: 400,
              lineHeight: 1.5,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 12,
              marginBottom: 32,
            }}
          >
            Reference: {this.state.diagRef}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleRetry}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 16,
                padding: '14px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                backgroundColor: '#2EFFAF',
                color: '#0F1419',
                border: 'none',
                borderRadius: 16,
                padding: '14px 24px',
                fontSize: 14,
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Go Home
            </button>
            <button
              onClick={this.handleSignIn}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 16,
                padding: '14px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
