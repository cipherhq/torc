import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  icon: string | null;
  is_active: boolean | null;
}

const SERVICE_ICONS: Record<string, string> = {
  towing: '🚛',
  battery_jumpstart: '🔋',
  lockout: '🔑',
  fuel_delivery: '⛽',
  tire_change: '🛞',
  winch_out: '🪝',
  minor_repair: '🔧',
  diagnostic: '🔍',
  emergency_help: '🚨',
  motorcycle: '🏍️',
  ev_charge: '⚡',
  consultation: '💬',
};

export default function ExploreScreen() {
  const router = useRouter();
  const { isAuthenticated, profile } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, description, base_price, icon, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setServices((data || []) as ServiceRow[]);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (service: ServiceRow) => {
    const key = service.icon || service.name.toLowerCase().replace(/\s+/g, '_');
    return SERVICE_ICONS[key] || '🛠️';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <Text style={styles.subtitle}>Discover Torc roadside services</Text>
      </View>

      {/* How it works */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How Torc Works</Text>
        <View style={styles.stepRow}>
          <View style={styles.stepCard}>
            <Text style={styles.stepIcon}>📍</Text>
            <Text style={styles.stepLabel}>Request</Text>
            <Text style={styles.stepDesc}>Select a service and share your location</Text>
          </View>
          <View style={styles.stepCard}>
            <Text style={styles.stepIcon}>🔄</Text>
            <Text style={styles.stepLabel}>Match</Text>
            <Text style={styles.stepDesc}>We find the nearest available provider</Text>
          </View>
          <View style={styles.stepCard}>
            <Text style={styles.stepIcon}>✅</Text>
            <Text style={styles.stepLabel}>Done</Text>
            <Text style={styles.stepDesc}>Provider arrives and completes the job</Text>
          </View>
        </View>
      </View>

      {/* Services */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Services</Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading services...</Text>
        ) : services.length === 0 ? (
          <Text style={styles.emptyText}>No services available yet.</Text>
        ) : (
          services.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={styles.serviceCard}
              onPress={() => {
                if (isAuthenticated) {
                  router.push({ pathname: '/webview', params: { initialPath: `/service-details/${service.id}` } });
                } else {
                  router.push('/auth/signup');
                }
              }}
            >
              <Text style={styles.serviceIcon}>{getIcon(service)}</Text>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{service.name}</Text>
                {service.description && (
                  <Text style={styles.serviceDesc} numberOfLines={2}>{service.description}</Text>
                )}
              </View>
              {service.base_price != null && (
                <Text style={styles.servicePrice}>
                  From ${Number(service.base_price).toFixed(0)}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* CTA */}
      {!isAuthenticated && (
        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>Ready to get started?</Text>
          <Text style={styles.ctaDesc}>
            Sign up for Torc and get roadside assistance in minutes.
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/auth/signup')}
          >
            <Text style={styles.ctaButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAuthenticated && profile?.role === 'customer' && (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.replace({ pathname: '/webview', params: { initialPath: '/service-selection' } })}
        >
          <Text style={styles.ctaButtonText}>Request a Service</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  stepIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  serviceIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  serviceDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  servicePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2EFFAF',
    marginLeft: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingVertical: 24,
  },
  ctaSection: {
    paddingHorizontal: 24,
    marginTop: 8,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  ctaDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaButton: {
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginHorizontal: 24,
    alignSelf: 'stretch',
  },
  ctaButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
