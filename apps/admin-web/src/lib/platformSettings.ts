import { supabase } from './supabase';

export type PlatformSettingsMap = {
  platformFee: number;
  serviceFee: number;
  currency: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoApproveProviders: boolean;
  maintenanceMode: boolean;
  maxJobRadius: number;
  providerTimeout: number;
  urgentSlaHours: number;
  standardSlaHours: number;
  document_grace_period_days: number;
  chat_max_message_length: number;
  chat_messages_per_page: number;
  chat_history_retention_days: number;
  chat_conversations_per_page: number;
  chat_max_image_size_mb: number;
  chat_enable_images: boolean;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsMap = {
  platformFee: 15,
  serviceFee: 10,
  currency: 'USD',
  emailNotifications: true,
  smsNotifications: true,
  autoApproveProviders: false,
  maintenanceMode: false,
  maxJobRadius: 50,
  providerTimeout: 5,
  urgentSlaHours: 2,
  standardSlaHours: 24,
  document_grace_period_days: 30,
  chat_max_message_length: 1000,
  chat_messages_per_page: 30,
  chat_history_retention_days: 90,
  chat_conversations_per_page: 20,
  chat_max_image_size_mb: 5,
  chat_enable_images: true,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_PLATFORM_SETTINGS);
const CACHE_TTL_MS = 60_000;

// Map camelCase cache keys → snake_case DB keys written by Settings.tsx
const DB_KEY_ALIASES: Record<string, string> = {
  platformFee: 'platform_commission_pct',
  serviceFee: 'service_fee_pct',
  emailNotifications: 'email_notifications',
  smsNotifications: 'sms_notifications',
  autoApproveProviders: 'auto_approve_providers',
  maintenanceMode: 'maintenance_mode',
  maxJobRadius: 'max_job_radius',
  providerTimeout: 'provider_timeout',
};

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
    // Query both camelCase keys and their snake_case DB aliases
    const aliasValues = Object.values(DB_KEY_ALIASES);
    const allDbKeys = [...SETTINGS_KEYS, ...aliasValues];

    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', allDbKeys);

    if (error && !String(error.message || '').toLowerCase().includes('does not exist')) {
      throw error;
    }

    const valuesByKey: Record<string, unknown> = {};
    (data || []).forEach((row: any) => {
      valuesByKey[row.key] = row.value;
    });

    const merged = SETTINGS_KEYS.reduce((acc, key) => {
      const typedKey = key as keyof PlatformSettingsMap;
      // Prefer the snake_case DB alias if it exists, fall back to camelCase key
      const alias = DB_KEY_ALIASES[key];
      const value = valuesByKey[key] ?? (alias ? valuesByKey[alias] : undefined) ?? DEFAULT_PLATFORM_SETTINGS[typedKey];
      acc[typedKey] = parseSettingValue(typedKey, value) as never;
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
