import { supabase } from './supabase';

export type PlatformSettingsMap = {
  platformFee: number;
  currency: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoApproveProviders: boolean;
  maintenanceMode: boolean;
  maxJobRadius: number;
  providerTimeout: number;
  urgentSlaHours: number;
  standardSlaHours: number;
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
  urgentSlaHours: 2,
  standardSlaHours: 24,
};

const SETTINGS_KEYS = Object.keys(DEFAULT_PLATFORM_SETTINGS);
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
      .in('key', SETTINGS_KEYS);

    if (error && !String(error.message || '').toLowerCase().includes('does not exist')) {
      throw error;
    }

    const valuesByKey: Record<string, unknown> = {};
    (data || []).forEach((row: any) => {
      valuesByKey[row.key] = row.value;
    });

    const merged = SETTINGS_KEYS.reduce((acc, key) => {
      const typedKey = key as keyof PlatformSettingsMap;
      acc[typedKey] = parseSettingValue(typedKey, valuesByKey[key] ?? DEFAULT_PLATFORM_SETTINGS[typedKey]) as never;
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
