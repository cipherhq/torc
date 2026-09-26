import { describe, expect, it } from 'vitest';
import { canQueryAdminDashboardFinancials, getProviderPerformanceRows, providerPerformanceShowsEarnings, visibleDashboardActionLabels } from '../pages/admin/Dashboard';

describe('dashboard role authority', () => {
  it('does not query or expose admin financial/refund dashboard features to Support', () => {
    expect(canQueryAdminDashboardFinancials('support')).toBe(false);
    const labels = visibleDashboardActionLabels('support');
    expect(labels).not.toContain('Manage Payouts');
    expect(labels).not.toContain('Financial Hub');
    expect(labels).not.toContain('Reporting Hub');
    expect(labels).not.toContain('Service Pricing');
    expect(providerPerformanceShowsEarnings('support')).toBe(false);
    const rows = getProviderPerformanceRows([{ id: 'p1', name: 'Provider', rating: 5, jobs: 10, earnings: 9999 }], 'support');
    expect(rows[0]).not.toHaveProperty('earnings');
  });

  it('preserves financial dashboard features for Admin', () => {
    expect(canQueryAdminDashboardFinancials('admin')).toBe(true);
    const labels = visibleDashboardActionLabels('admin');
    expect(labels).toContain('Manage Payouts');
    expect(labels).toContain('Financial Hub');
    expect(labels).toContain('Reporting Hub');
    expect(labels).toContain('Service Pricing');
    expect(providerPerformanceShowsEarnings('admin')).toBe(true);
    expect(getProviderPerformanceRows([{ id: 'p1', name: 'Provider', rating: 5, jobs: 10, earnings: 9999 }], 'admin')[0].earnings).toBe(9999);
  });
});
