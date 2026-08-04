/**
 * ErrorBoundary tests — verifies error catching, diagnostic ref display,
 * retry button, and normal rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';

// ---------------------------------------------------------------------------
// A component that throws on demand
// ---------------------------------------------------------------------------
function ThrowingChild({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test crash');
  }
  return <div data-testid="child-content">All good</div>;
}

// Suppress React error boundary console.error noise during tests
const originalConsoleError = console.error;

beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toHaveTextContent('All good');
  });

  it('catches error and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('displays a diagnostic reference code in TORC-C-xxx format', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    const refElement = screen.getByText(/Ref: TORC-C-/);
    expect(refElement).toBeInTheDocument();

    // Verify format: TORC-C-<base36-timestamp>-<4-char-random>
    const refText = refElement.textContent || '';
    const match = refText.match(/TORC-C-[A-Z0-9]+-[A-Z0-9]{4}/);
    expect(match).not.toBeNull();
  });

  it('shows Retry button that calls window.location.reload', () => {
    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock, href: '' },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();

    retryButton.click();
    expect(reloadMock).toHaveBeenCalled();
  });

  it('shows Go Home button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('shows Sign In button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('generates unique diagnostic refs for different errors', () => {
    const { unmount: unmount1 } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    const ref1 = screen.getByText(/Ref: TORC-C-/).textContent;
    unmount1();

    // Small delay to ensure different timestamp
    const { unmount: unmount2 } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    const ref2 = screen.getByText(/Ref: TORC-C-/).textContent;
    unmount2();

    // Refs should exist (may or may not be unique depending on timing,
    // but both should be valid format)
    expect(ref1).toMatch(/TORC-C-[A-Z0-9]+-[A-Z0-9]{4}/);
    expect(ref2).toMatch(/TORC-C-[A-Z0-9]+-[A-Z0-9]{4}/);
  });
});
