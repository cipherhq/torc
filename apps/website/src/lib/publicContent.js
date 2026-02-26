import { supabase } from './supabase';

const PUBLIC_CONTENT_KEYS = [
  'terms_version',
  'terms_last_updated',
  'terms_customer_text',
  'terms_provider_text',
  'help_customer_text',
  'help_provider_text',
];

const DEFAULT_PUBLIC_CONTENT = {
  terms_version: 'v1.0.0',
  terms_last_updated: '2026-02-26',
  terms_customer_text: `TORC CUSTOMER TERMS OF SERVICE
Last updated: 2026-02-26

1. Eligibility
You must be 18 years or older to request service through TORC.`,
  terms_provider_text: `TORC PROVIDER TERMS OF SERVICE
Last updated: 2026-02-26

1. Eligibility and Compliance
You must maintain valid licensing, insurance, and required credentials.`,
  help_customer_text: `CUSTOMER HELP CENTER

Getting Started
- Create your account and verify your email.
- Choose the service you need and confirm your location.`,
  help_provider_text: `PROVIDER HELP CENTER

Getting Started
- Create provider account and complete onboarding.
- Upload required documents for verification.`,
};

const CACHE_TTL_MS = 60_000;
let cachedContent = null;
let cachedAt = 0;

export async function loadPublicPlatformContent(force = false) {
  const now = Date.now();
  if (!force && cachedContent && now - cachedAt < CACHE_TTL_MS) {
    return cachedContent;
  }

  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', PUBLIC_CONTENT_KEYS);

    if (error) throw error;

    const merged = { ...DEFAULT_PUBLIC_CONTENT };
    (data || []).forEach((row) => {
      if (PUBLIC_CONTENT_KEYS.includes(row.key)) {
        merged[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '');
      }
    });

    cachedContent = merged;
    cachedAt = now;
    return merged;
  } catch (error) {
    console.warn('Failed to load public platform content; using defaults.', error);
    return cachedContent || DEFAULT_PUBLIC_CONTENT;
  }
}
