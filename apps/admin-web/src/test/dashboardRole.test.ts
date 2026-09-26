import { describe, expect, it } from 'vitest';
import { canQueryAdminDashboardFinancials, visibleDashboardActionLabels } from '../pages/admin/Dashboard';

describe('dashboard role authority', () => {
  it('does not query or expose admin financial/refund dashboard features to Support', () => {
    expect(canQueryAdminDashboardFinancials('support')).toBe(false);
    const labels = visibleDashboardActionLabels('support');
    expect(labels).not.toContain('Manage Payouts');
    expect(labels).not.toContain('Financial Hub');
    expect(labels).not.toContain('Reporting Hub');
  });

  it('preserves financial dashboard features for Admin', () => {
    expect(canQueryAdminDashboardFinancials('admin')).toBe(true);
    const labels = visibleDashboardActionLabels('admin');
    expect(labels).toContain('Manage Payouts');
    expect(labels).toContain('Financial Hub');
    expect(labels).toContain('Reporting Hub');
  });
});
