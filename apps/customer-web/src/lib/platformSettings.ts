import { supabase } from './supabase';

// DB keys (snake_case) → app keys used by consumers
const DB_TO_APP_KEY: Record<string, string> = {
  platform_commission_pct: 'platformFee',
  currency: 'currency',
  email_notifications: 'emailNotifications',
  sms_notifications: 'smsNotifications',
  auto_approve_providers: 'autoApproveProviders',
  maintenance_mode: 'maintenanceMode',
  max_job_radius: 'maxJobRadius',
  provider_timeout: 'providerTimeout',
  cancellation_fee_pct: 'cancellation_fee_pct',
  tax_rate_pct: 'tax_rate_pct',
  service_fee_pct: 'service_fee_pct',
  hazard_fee: 'hazard_fee',
  scheduling_fee: 'scheduling_fee',
  chat_max_message_length: 'chat_max_message_length',
  chat_messages_per_page: 'chat_messages_per_page',
  chat_history_retention_days: 'chat_history_retention_days',
  chat_conversations_per_page: 'chat_conversations_per_page',
  chat_max_image_size_mb: 'chat_max_image_size_mb',
  chat_enable_images: 'chat_enable_images',
};

export type PlatformSettingsMap = {
  platformFee: number;
  currency: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoApproveProviders: boolean;
  maintenanceMode: boolean;
  maxJobRadius: number;
  providerTimeout: number;
  cancellation_fee_pct: number;
  tax_rate_pct: number;
  service_fee_pct: number;
  hazard_fee: number;
  scheduling_fee: number;
  chat_max_message_length: number;
  chat_messages_per_page: number;
  chat_history_retention_days: number;
  chat_conversations_per_page: number;
  chat_max_image_size_mb: number;
  chat_enable_images: boolean;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsMap = {
  platformFee: 15,
  currency: 'USD',
  emailNotifications: true,
  smsNotifications: true,
  autoApproveProviders: false,
  maintenanceMode: false,
  maxJobRadius: 50,
  providerTimeout: 5,
  cancellation_fee_pct: 25,
  tax_rate_pct: 8,
  service_fee_pct: 0,
  hazard_fee: 0,
  scheduling_fee: 0,
  chat_max_message_length: 1000,
  chat_messages_per_page: 30,
  chat_history_retention_days: 90,
  chat_conversations_per_page: 20,
  chat_max_image_size_mb: 5,
  chat_enable_images: true,
};

const DB_KEYS = Object.keys(DB_TO_APP_KEY);
const CACHE_TTL_MS = 60_000;

let cachedSettings: PlatformSettingsMap | null = null;
let cachedAt = 0;

function parseSettingValue(key: keyof PlatformSettingsMap, value: unknown) {
  if (typeof DEFAULT_PLATFORM_SETTINGS[key] === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : DEFAULT_PLATFORM_SETTINGS[key];
  }
  if (typeof DEFAULT_PLATFORM_SETTINGS[key] === 'boolean') {
    return Boolean(value);
  }
  return typeof value === 'string' ? value : DEFAULT_PLATFORM_SETTINGS[key];
}

export async function loadPlatformSettings(force = false): Promise<PlatformSettingsMap> {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', DB_KEYS);

    if (error && !String(error.message || '').toLowerCase().includes('does not exist')) {
      throw error;
    }

    // Map DB snake_case keys to app keys
    const valuesByAppKey: Record<string, unknown> = {};
    (data || []).forEach((row: any) => {
      const appKey = DB_TO_APP_KEY[row.key];
      if (appKey) valuesByAppKey[appKey] = row.value;
    });

    const appKeys = Object.keys(DEFAULT_PLATFORM_SETTINGS);
    const merged = appKeys.reduce((acc, key) => {
      const typedKey = key as keyof PlatformSettingsMap;
      acc[typedKey] = parseSettingValue(typedKey, valuesByAppKey[key] ?? DEFAULT_PLATFORM_SETTINGS[typedKey]) as never;
      return acc;
    }, { ...DEFAULT_PLATFORM_SETTINGS } as PlatformSettingsMap);

    cachedSettings = merged;
    cachedAt = now;
    return merged;
  } catch (error) {
    console.warn('Failed to load platform settings, using defaults:', error);
    return cachedSettings || DEFAULT_PLATFORM_SETTINGS;
  }
}

export function invalidatePlatformSettingsCache() {
  cachedSettings = null;
  cachedAt = 0;
}
