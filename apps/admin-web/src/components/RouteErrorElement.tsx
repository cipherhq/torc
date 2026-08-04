import { useRouteError } from 'react-router';

function generateDiagnosticRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TORC-AR-${ts}-${rand}`;
}

export function RouteErrorElement() {
  const error = useRouteError();
  const ref = generateDiagnosticRef();

  console.error(`[RouteError] ref=${ref}`, error);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Page Error</h1>
        <p className="text-sm text-gray-500">
          This page encountered an error. Please try again.
        </p>
        <p className="text-xs text-gray-400 font-mono">Ref: {ref}</p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-[#008CE5] text-white font-semibold text-sm"
          >
            Retry
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard'; }}
            className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
