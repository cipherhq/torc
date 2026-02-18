import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { registerForPushNotifications } from '../../utils/pushNotifications';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, profile, loading, signOut } = useAuth();
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !pushToken) {
      registerForPushNotifications().then((token) => {
        if (token) {
          setPushToken(token);
          console.log('Push token registered:', token);
        }
      }).catch(err => {
        console.log('Push token registration skipped:', err.message);
      });
    }
  }, [isAuthenticated, pushToken]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/auth/login');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2EFFAF" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.welcomeContainer}>
        <View style={styles.welcomeContent}>
          <Text style={styles.title}>TORC</Text>
          <Text style={styles.subtitle}>Your Roadside Companion</Text>
          <Text style={styles.description}>
            Get help when you need it, where you need it.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/auth/signup')}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Customer Home
  if (profile?.role === 'customer') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.userName}>
              {profile?.first_name || 'Customer'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <TouchableOpacity
            onPress={() => Alert.alert('Request Service', 'Service booking coming soon!')}
            style={styles.requestServiceButton}
          >
            <Text style={styles.requestServiceTitle}>Request Service</Text>
            <Text style={styles.requestServiceSubtitle}>
              Get roadside assistance now
            </Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Available Services</Text>
            {['Towing', 'Jump Start', 'Flat Tire', 'Fuel Delivery', 'Lockout'].map((service) => (
              <TouchableOpacity
                key={service}
                style={styles.serviceItem}
                onPress={() => Alert.alert('Service', `${service} selected`)}
              >
                <Text style={styles.serviceText}>{service}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  // Provider Home
  if (profile?.role === 'provider') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.userName}>
              {profile?.first_name || 'Provider'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.cardTitle}>Status</Text>
              <View style={styles.onlineBadge}>
                <Text style={styles.onlineText}>Online</Text>
              </View>
            </View>
            <Text style={styles.statusDescription}>
              You're online and ready to accept jobs.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Today</Text>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Jobs</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Earnings</Text>
              <Text style={styles.statEarnings}>$0</Text>
              <Text style={styles.statLabel}>This week</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Active Jobs</Text>
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active jobs</Text>
              <Text style={styles.emptySubtext}>
                You'll receive a notification when a new job is available
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Fallback
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.errorText}>Unknown Role</Text>
      <TouchableOpacity
        onPress={handleSignOut}
        style={styles.errorButton}
      >
        <Text style={styles.errorButtonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  welcomeContent: {
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  description: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  primaryButton: {
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  primaryButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    borderRadius: 16,
  },
  secondaryButtonText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
  },
  welcomeText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  userName: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  signOutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  signOutText: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  requestServiceButton: {
    backgroundColor: '#2EFFAF',
    borderRadius: 24,
    padding: 32,
    marginBottom: 16,
  },
  requestServiceTitle: {
    color: '#0F1419',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  requestServiceSubtitle: {
    color: 'rgba(15, 20, 25, 0.7)',
    fontSize: 18,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  serviceItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  serviceText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  onlineBadge: {
    backgroundColor: 'rgba(46, 255, 175, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  onlineText: {
    color: '#2EFFAF',
    fontWeight: '600',
  },
  statusDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statEarnings: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#2EFFAF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 20,
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#EF4444',
    fontWeight: '600',
  },
});
