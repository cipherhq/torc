import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const signOut = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut } } }));

import { AdminSidebar } from '../components/AdminSidebar';

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
