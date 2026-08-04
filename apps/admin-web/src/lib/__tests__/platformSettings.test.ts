import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the module under test
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
}));

import {
  DEFAULT_PLATFORM_SETTINGS,
  loadPlatformSettings,
  invalidatePlatformSettingsCache,
} from '../platformSettings';
import type { PlatformSettingsMap } from '../platformSettings';

describe('platformSettings', () => {
  beforeEach(() => {
    // Clear the module-level cache before each test
    invalidatePlatformSettingsCache();
  });

  describe('DEFAULT_PLATFORM_SETTINGS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_PLATFORM_SETTINGS.platformFee).toBe(15);
      expect(DEFAULT_PLATFORM_SETTINGS.serviceFee).toBe(10);
      expect(DEFAULT_PLATFORM_SETTINGS.currency).toBe('USD');
      expect(DEFAULT_PLATFORM_SETTINGS.emailNotifications).toBe(true);
      expect(DEFAULT_PLATFORM_SETTINGS.smsNotifications).toBe(true);
      expect(DEFAULT_PLATFORM_SETTINGS.autoApproveProviders).toBe(false);
      expect(DEFAULT_PLATFORM_SETTINGS.maintenanceMode).toBe(false);
      expect(DEFAULT_PLATFORM_SETTINGS.maxJobRadius).toBe(50);
      expect(DEFAULT_PLATFORM_SETTINGS.providerTimeout).toBe(5);
    });

    it('has SLA hour defaults', () => {
      expect(DEFAULT_PLATFORM_SETTINGS.urgentSlaHours).toBe(2);
      expect(DEFAULT_PLATFORM_SETTINGS.standardSlaHours).toBe(24);
    });

    it('has document grace period default', () => {
      expect(DEFAULT_PLATFORM_SETTINGS.document_grace_period_days).toBe(30);
    });

    it('has chat-related defaults', () => {
      expect(DEFAULT_PLATFORM_SETTINGS.chat_max_message_length).toBe(1000);
      expect(DEFAULT_PLATFORM_SETTINGS.chat_messages_per_page).toBe(30);
      expect(DEFAULT_PLATFORM_SETTINGS.chat_history_retention_days).toBe(90);
      expect(DEFAULT_PLATFORM_SETTINGS.chat_conversations_per_page).toBe(20);
      expect(DEFAULT_PLATFORM_SETTINGS.chat_max_image_size_mb).toBe(5);
      expect(DEFAULT_PLATFORM_SETTINGS.chat_enable_images).toBe(true);
    });

    it('all numeric values are numbers', () => {
      const numericKeys: (keyof PlatformSettingsMap)[] = [
        'platformFee', 'serviceFee', 'maxJobRadius', 'providerTimeout',
        'urgentSlaHours', 'standardSlaHours', 'document_grace_period_days',
        'chat_max_message_length', 'chat_messages_per_page',
        'chat_history_retention_days', 'chat_conversations_per_page',
        'chat_max_image_size_mb',
      ];
      for (const key of numericKeys) {
        expect(typeof DEFAULT_PLATFORM_SETTINGS[key]).toBe('number');
      }
    });

    it('all boolean values are booleans', () => {
      const booleanKeys: (keyof PlatformSettingsMap)[] = [
        'emailNotifications', 'smsNotifications', 'autoApproveProviders',
        'maintenanceMode', 'chat_enable_images',
      ];
      for (const key of booleanKeys) {
        expect(typeof DEFAULT_PLATFORM_SETTINGS[key]).toBe('boolean');
      }
    });
  });

  describe('loadPlatformSettings', () => {
    it('returns defaults when Supabase returns empty data', async () => {
      const settings = await loadPlatformSettings(true);
      expect(settings.platformFee).toBe(DEFAULT_PLATFORM_SETTINGS.platformFee);
      expect(settings.currency).toBe(DEFAULT_PLATFORM_SETTINGS.currency);
      expect(settings.maintenanceMode).toBe(DEFAULT_PLATFORM_SETTINGS.maintenanceMode);
    });

    it('returns a complete settings object with all keys', async () => {
      const settings = await loadPlatformSettings(true);
      const expectedKeys = Object.keys(DEFAULT_PLATFORM_SETTINGS);
      for (const key of expectedKeys) {
        expect(settings).toHaveProperty(key);
      }
    });
  });

  describe('invalidatePlatformSettingsCache', () => {
    it('does not throw when called', () => {
      expect(() => invalidatePlatformSettingsCache()).not.toThrow();
    });
  });
});
