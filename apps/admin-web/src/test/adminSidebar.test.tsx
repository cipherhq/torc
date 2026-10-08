import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const signOut = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut } } }));

import { AdminSidebar } from '../components/AdminSidebar';
import { SUPPORT_ALLOWED_PATHS, canAccessAdminPath } from '../lib/adminAuth';

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

describe('AdminSidebar sign out', () => {
  it('signs out only the current session and returns to login', async () => {
    signOut.mockResolvedValue({ error: null });
    render(<MemoryRouter initialEntries={['/dashboard']}><AdminSidebar /><CurrentPath /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/login'));
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('shows an error if sign out fails', async () => {
    signOut.mockResolvedValue({ error: new Error('Network unavailable') });
    render(<MemoryRouter initialEntries={['/dashboard']}><AdminSidebar /><CurrentPath /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable');
    expect(screen.getByTestId('path').textContent).toBe('/dashboard');
  });
});

describe('Support navigation authority', () => {
  it('exposes only operational visibility and ticket routes', () => {
    expect(SUPPORT_ALLOWED_PATHS.has('/documents')).toBe(true);
    expect(SUPPORT_ALLOWED_PATHS.has('/jobs')).toBe(true);
    expect(SUPPORT_ALLOWED_PATHS.has('/support-tickets')).toBe(true);
    expect(SUPPORT_ALLOWED_PATHS.has('/providers')).toBe(false);
    expect(canAccessAdminPath('support', '/providers')).toBe(false);
    expect(canAccessAdminPath('admin', '/providers')).toBe(true);
    expect(SUPPORT_ALLOWED_PATHS.has('/notifications')).toBe(false);
    expect(SUPPORT_ALLOWED_PATHS.has('/directory')).toBe(false);
    expect(SUPPORT_ALLOWED_PATHS.has('/payouts')).toBe(false);
    expect(SUPPORT_ALLOWED_PATHS.has('/services')).toBe(false);
    expect(SUPPORT_ALLOWED_PATHS.has('/team')).toBe(false);
  });

  it('denies support access to admin-only routes while admins retain access', () => {
    expect(canAccessAdminPath('support', '/finance')).toBe(false);
    expect(canAccessAdminPath('support', '/settings')).toBe(false);
    expect(canAccessAdminPath('admin', '/finance')).toBe(true);
  });
});
