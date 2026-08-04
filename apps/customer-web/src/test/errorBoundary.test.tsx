import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Suppress React error boundary console.error noise in test output
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  cleanup();
  console.error = originalConsoleError;
});

function GoodChild() {
  return <div data-testid="child">Hello</div>;
}

function ThrowingChild({ message = 'Test error' }: { message?: string }) {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child').textContent).toBe('Hello');
  });

  it('shows error screen with diagnostic reference when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="Kaboom" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Kaboom')).toBeInTheDocument();

    const refElement = screen.getByText(/Reference: TORC-/);
    expect(refElement).toBeInTheDocument();
  });

  it('retry button resets error and re-renders children', () => {
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <div data-testid="recovered-child">Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing before clicking retry
    shouldThrow = false;

    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByTestId('recovered-child')).toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('Go Home button navigates to /customer/home', () => {
    // In jsdom, window.location is available. We need to intercept the assignment.
    const hrefSetter = vi.fn();
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

    // Replace location with a proxy that captures href sets
    delete (window as any).location;
    (window as any).location = new Proxy({} as Location, {
      set(_target, prop, value) {
        if (prop === 'href') {
          hrefSetter(value);
        }
        return true;
      },
      get(_target, prop) {
        if (prop === 'href') return '';
        return undefined;
      },
    });

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go Home'));
    expect(hrefSetter).toHaveBeenCalledWith('/customer/home');

    // Restore
    if (originalDescriptor) {
      Object.defineProperty(window, 'location', originalDescriptor);
    }
  });
});
