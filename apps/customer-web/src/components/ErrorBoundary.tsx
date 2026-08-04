import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  diagnosticRef: string;
}

function generateDiagnosticRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TORC-C-${ts}-${rand}`;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, diagnosticRef: '' };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, diagnosticRef: generateDiagnosticRef() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary] ref=${this.state.diagnosticRef}`,
      error.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
            <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-500">
              An unexpected error occurred. Please try again.
            </p>
            <p className="text-xs text-gray-400 font-mono">
              Ref: {this.state.diagnosticRef}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 rounded-xl bg-[#008CE5] text-white font-semibold text-sm"
              >
                Retry
              </button>
              <button
                onClick={() => { window.location.href = '/customer/home'; }}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
              >
                Go Home
              </button>
              <button
                onClick={() => { window.location.href = '/login'; }}
                className="w-full py-2 text-sm text-gray-400 underline"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
