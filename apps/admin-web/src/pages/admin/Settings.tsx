import { motion } from 'motion/react';
import { AdminLayout } from '../../components/AdminLayout';
import { Settings as SettingsIcon, DollarSign, Bell, Shield, Globe, Save, Loader2, CheckCircle, Percent, MessageCircle, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface PlatformSettings {
  cancellation_fee_pct: number;
  platform_commission_pct: number;
  tax_rate_pct: number;
  service_fee_pct: number;
  hazard_fee: number;
  scheduling_fee: number;
  currency: string;
  max_job_radius: number;
  provider_timeout: number;
  email_notifications: boolean;
  sms_notifications: boolean;
  auto_approve_providers: boolean;
  document_grace_period_days: number;
  maintenance_mode: boolean;
  chat_max_message_length: number;
  chat_messages_per_page: number;
  chat_history_retention_days: number;
  chat_conversations_per_page: number;
  chat_max_image_size_mb: number;
  chat_enable_images: boolean;
  terms_version: string;
  terms_last_updated: string;
  terms_customer_text: string;
  terms_provider_text: string;
  help_customer_text: string;
  help_provider_text: string;
}

const DEFAULTS: PlatformSettings = {
  cancellation_fee_pct: 25,
  platform_commission_pct: 15,
  tax_rate_pct: 8,
  service_fee_pct: 10,
  hazard_fee: 15,
  scheduling_fee: 5,
  currency: 'USD',
  max_job_radius: 50,
  provider_timeout: 5,
  email_notifications: true,
  sms_notifications: true,
  auto_approve_providers: false,
  document_grace_period_days: 30,
  maintenance_mode: false,
  chat_max_message_length: 1000,
  chat_messages_per_page: 30,
  chat_history_retention_days: 90,
  chat_conversations_per_page: 20,
  chat_max_image_size_mb: 5,
  chat_enable_images: true,
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

type SettingItem = {
  label: string;
  description: string;
  type: 'toggle' | 'number' | 'select' | 'text' | 'textarea';
  key: keyof PlatformSettings;
  suffix?: string;
  options?: string[];
  rows?: number;
};

type SettingSection = {
  title: string;
  icon: any;
  gradient: string;
  description: string;
  items: SettingItem[];
};

export function AdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings from DB on mount
  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('key, value');

        if (!error && data) {
          const loaded = { ...DEFAULTS };
          data.forEach((row: { key: string; value: any }) => {
            if (row.key in loaded) {
              (loaded as any)[row.key] = row.value;
            }
          });
          setSettings(loaded);
        }
      } catch (e) {
        console.warn('Failed to load platform settings, using defaults:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save all settings to DB
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const entries = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('platform_settings')
        .upsert(entries, { onConflict: 'key' });

      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Failed to save settings:', e);
      alert('Failed to save settings. Make sure you are logged in as admin.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key: keyof PlatformSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNumberChange = (key: keyof PlatformSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const settingSections: SettingSection[] = [
    {
      title: 'Fees & Commission',
      icon: Percent,
      gradient: 'linear-gradient(135deg, #FF6B6B, #FF5252)',
      description: 'Control platform revenue, cancellation penalties, and surcharges',
      items: [
        {
          label: 'Cancellation Fee (Not Active)',
          description: 'Displayed in UI but refund/charge architecture not yet implemented',
          type: 'number' as const,
          key: 'cancellation_fee_pct' as keyof PlatformSettings,
          suffix: '%',
          disabled: true,
        },
        {
          label: 'Platform Commission',
          description: 'Percentage the platform takes from each completed job',
          type: 'number' as const,
          key: 'platform_commission_pct' as keyof PlatformSettings,
          suffix: '%',
        },
        {
          label: 'Service Fee (Not Active)',
          description: 'Currently not applied to checkout totals — activation requires product authorization',
          type: 'number' as const,
          key: 'service_fee_pct' as keyof PlatformSettings,
          suffix: '%',
          disabled: true,
        },
        {
          label: 'Tax Rate',
          description: 'Tax percentage applied to the subtotal',
          type: 'number' as const,
          key: 'tax_rate_pct' as keyof PlatformSettings,
          suffix: '%',
        },
        {
          label: 'Hazard Location Fee',
          description: 'Flat fee for service at hazardous locations',
          type: 'number' as const,
          key: 'hazard_fee' as keyof PlatformSettings,
          suffix: '$',
        },
        {
          label: 'Scheduling Fee',
          description: 'Flat fee for pre-scheduled service requests',
          type: 'number' as const,
          key: 'scheduling_fee' as keyof PlatformSettings,
          suffix: '$',
        },
      ],
    },
    {
      title: 'Financial Settings',
      icon: DollarSign,
      gradient: 'linear-gradient(135deg, #008CE5, #0070B8)',
      description: 'Currency and payment configuration',
      items: [
        {
          label: 'Currency',
          description: 'Platform default currency',
          type: 'select' as const,
          key: 'currency' as keyof PlatformSettings,
          options: ['USD', 'EUR', 'GBP', 'CAD'],
        },
      ],
    },
    {
      title: 'Notifications',
      icon: Bell,
      gradient: 'linear-gradient(135deg, #007AFF, #0051D5)',
      description: 'Configure user notification channels',
      items: [
        {
          label: 'Email Notifications',
          description: 'Send email alerts to users',
          type: 'toggle' as const,
          key: 'email_notifications' as keyof PlatformSettings,
        },
        {
          label: 'SMS Notifications',
          description: 'Send SMS alerts to users',
          type: 'toggle' as const,
          key: 'sms_notifications' as keyof PlatformSettings,
        },
      ],
    },
    {
      title: 'Provider Management',
      icon: Shield,
      gradient: 'linear-gradient(135deg, #FF6B6B, #FF5252)',
      description: 'Provider approval and job assignment settings',
      items: [
        {
          label: 'Auto-Approve Providers (Not Active)',
          description: 'Not yet enforced — providers require manual approval',
          type: 'toggle' as const,
          key: 'auto_approve_providers' as keyof PlatformSettings,
          disabled: true,
        },
        {
          label: 'Document Grace Period',
          description: 'Days new providers have to submit all documents before account locks',
          type: 'number' as const,
          key: 'document_grace_period_days' as keyof PlatformSettings,
          suffix: 'days',
        },
        {
          label: 'Provider Response Timeout',
          description: 'Minutes before reassigning job',
          type: 'number' as const,
          key: 'provider_timeout' as keyof PlatformSettings,
          suffix: 'min',
        },
      ],
    },
    {
      title: 'Platform Operations',
      icon: Globe,
      gradient: 'linear-gradient(135deg, #FFA500, #FF8C00)',
      description: 'System-wide operational settings',
      items: [
        {
          label: 'Maintenance Mode (Not Active)',
          description: 'Not yet enforced — job creation is not blocked when enabled',
          type: 'toggle' as const,
          key: 'maintenance_mode' as keyof PlatformSettings,
          disabled: true,
        },
        {
          label: 'Max Job Search Radius',
          description: 'Maximum distance for provider matching',
          type: 'number' as const,
          key: 'max_job_radius' as keyof PlatformSettings,
          suffix: 'miles',
        },
      ],
    },
    {
      title: 'Messaging',
      icon: MessageCircle,
      gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
      description: 'Configure in-app chat limits and behavior',
      items: [
        {
          label: 'Max Message Length',
          description: 'Maximum characters per chat message',
          type: 'number' as const,
          key: 'chat_max_message_length' as keyof PlatformSettings,
          suffix: 'chars',
        },
        {
          label: 'Messages Per Page',
          description: 'Number of messages loaded at a time in chat',
          type: 'number' as const,
          key: 'chat_messages_per_page' as keyof PlatformSettings,
          suffix: 'msgs',
        },
        {
          label: 'Chat History Retention',
          description: 'Days to keep chat messages visible',
          type: 'number' as const,
          key: 'chat_history_retention_days' as keyof PlatformSettings,
          suffix: 'days',
        },
        {
          label: 'Conversations Per Page',
          description: 'Number of conversations shown per page in message list',
          type: 'number' as const,
          key: 'chat_conversations_per_page' as keyof PlatformSettings,
          suffix: 'convos',
        },
        {
          label: 'Max Image Size',
          description: 'Maximum upload size for image attachments',
          type: 'number' as const,
          key: 'chat_max_image_size_mb' as keyof PlatformSettings,
          suffix: 'MB',
        },
        {
          label: 'Enable Image Sharing',
          description: 'Allow users to share photos in chat',
          type: 'toggle' as const,
          key: 'chat_enable_images' as keyof PlatformSettings,
        },
      ],
    },
    {
      title: 'Legal & Help Content',
      icon: FileText,
      gradient: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
      description: 'Edit terms and help-center templates used by mobile apps and the website',
      items: [
        {
          label: 'Terms Version',
          description: 'Version shown to users when accepting terms during signup',
          type: 'text',
          key: 'terms_version',
        },
        {
          label: 'Terms Last Updated',
          description: 'Display date shown on legal pages',
          type: 'text',
          key: 'terms_last_updated',
        },
        {
          label: 'Customer Terms Template',
          description: 'Rendered on website terms page for customer audience',
          type: 'textarea',
          key: 'terms_customer_text',
          rows: 9,
        },
        {
          label: 'Provider Terms Template',
          description: 'Rendered on website terms page for provider audience',
          type: 'textarea',
          key: 'terms_provider_text',
          rows: 9,
        },
        {
          label: 'Customer Help Template',
          description: 'Rendered on website help center for customers',
          type: 'textarea',
          key: 'help_customer_text',
          rows: 8,
        },
        {
          label: 'Provider Help Template',
          description: 'Rendered on website help center for providers',
          type: 'textarea',
          key: 'help_provider_text',
          rows: 8,
        },
      ],
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#008CE5' }} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Platform Settings</h1>
            <p className="text-gray-500">Configure fees, commissions, and system-wide preferences</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base shadow-lg transition-all"
            style={{
              background: saved
                ? 'linear-gradient(to right, #22C55E, #16A34A)'
                : 'linear-gradient(to right, #008CE5, #0070B8)',
              color: '#FFFFFF',
              boxShadow: saved ? '0 8px 24px rgba(34,197,94,0.4)' : '0 8px 24px rgba(0,140,229,0.3)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </motion.button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingSections.map((section, sectionIndex) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.1 }}
                className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6"
              >
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: section.gradient }}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 font-bold text-xl">{section.title}</h2>
                    <p className="text-gray-400 text-sm">{section.description}</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  {section.items.map((item) => (
                    <div key={item.key} className="bg-gray-50 rounded-[20px] p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-gray-900 font-semibold mb-1">{item.label}</h3>
                          <p className="text-gray-500 text-sm">{item.description}</p>
                        </div>

                        <div className="ml-4">
                          {item.type === 'toggle' && (
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleToggle(item.key)}
                              style={{
                                width: 56,
                                height: 32,
                                borderRadius: 9999,
                                position: 'relative',
                                flexShrink: 0,
                                backgroundColor: settings[item.key] ? '#111827' : '#D1D5DB',
                                transition: 'background-color 0.2s',
                              }}
                            >
                              <div
                                style={{
                                  position: 'absolute',
                                  width: 24,
                                  height: 24,
                                  borderRadius: 9999,
                                  top: 4,
                                  backgroundColor: '#FFFFFF',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                  transition: 'left 0.2s, right 0.2s',
                                  ...(settings[item.key] ? { right: 4, left: 'auto' } : { left: 4, right: 'auto' }),
                                }}
                              />
                            </motion.button>
                          )}

                          {item.type === 'number' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={settings[item.key] as number}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleNumberChange(item.key, val === '' ? 0 : Number(val));
                                }}
                                className="w-28 px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-gray-900 text-center text-lg font-bold focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                              />
                              {item.suffix && (
                                <span className="text-gray-600 text-sm font-semibold">{item.suffix}</span>
                              )}
                            </div>
                          )}

                          {item.type === 'select' && (
                            <select
                              value={settings[item.key] as string}
                              onChange={(e) => setSettings(prev => ({ ...prev, [item.key]: e.target.value }))}
                              className="px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                            >
                              {item.options?.map((option) => (
                                <option key={option} value={option} className="bg-white">
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}

                          {item.type === 'text' && (
                            <input
                              type="text"
                              value={String(settings[item.key] ?? '')}
                              onChange={(e) => setSettings(prev => ({ ...prev, [item.key]: e.target.value }))}
                              className="w-64 px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                            />
                          )}

                          {item.type === 'textarea' && (
                            <textarea
                              value={String(settings[item.key] ?? '')}
                              onChange={(e) => setSettings(prev => ({ ...prev, [item.key]: e.target.value }))}
                              rows={item.rows || 8}
                              className="w-[30rem] max-w-[70vw] px-3 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-gray-900 text-sm leading-relaxed focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-y"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Save Button (mobile friendly) */}
        <div className="mt-8 pb-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-[24px] font-bold text-lg shadow-lg"
            style={{
              background: saved
                ? 'linear-gradient(to right, #22C55E, #16A34A)'
                : 'linear-gradient(to right, #008CE5, #0070B8)',
              color: '#FFFFFF',
              boxShadow: saved ? '0 8px 24px rgba(34,197,94,0.4)' : '0 8px 24px rgba(0,140,229,0.3)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saving ? 'Saving...' : saved ? 'Changes Saved!' : 'Save All Changes'}
          </motion.button>
        </div>
      </div>
    </AdminLayout>
  );
}
