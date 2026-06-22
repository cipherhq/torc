import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';

export default function MatchingScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, cancelJob, subscribeToJobUpdates } = useJob();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeWaiting, setTimeWaiting] = useState(0);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const data = await fetchJob(jobId as string);
      setJob(data);

      // If provider accepted, navigate to tracking
      if (data.provider_id && data.status === 'accepted') {
        router.replace(`/customer/tracking?jobId=${jobId}`);
      }
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchJob, jobId, router]);

  useEffect(() => {
    if (jobId) {
      loadJob();

      // Real-time subscription
      const unsubscribe = subscribeToJobUpdates(jobId as string, () => {
        console.log('Job updated');
        loadJob();
      });

      const timer = setInterval(() => {
        setTimeWaiting((prev) => prev + 1);
      }, 1000);

      return () => {
        unsubscribe();
        clearInterval(timer);
      };
    }
  }, [jobId, loadJob, subscribeToJobUpdates]);

  const handleCancel = async () => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelJob(jobId as string, 'Customer cancelled while waiting');
              Alert.alert('Cancelled', 'Your request has been cancelled', [
                { text: 'OK', onPress: () => router.replace('/') },
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2EFFAF" />
      </View>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Animated Loading Circle */}
      <View style={styles.loadingSection}>
        <View style={styles.loadingCircle}>
          <ActivityIndicator size="large" color="#2EFFAF" />
        </View>
        <Text style={styles.headingText}>Finding Provider...</Text>
        <Text style={styles.subtitleText}>
          We&apos;re matching you with the best available provider
        </Text>
        <Text style={styles.timerText}>
          {formatTime(timeWaiting)}
        </Text>
      </View>

      {/* Job Details */}
      <View style={styles.card}>
        <Text style={styles.labelText}>Service</Text>
        <Text style={styles.serviceNameText}>
          {job?.service?.name || 'Service Request'}
        </Text>

        {job?.pickup_address && (
          <>
            <Text style={styles.labelText}>Pickup</Text>
            <Text style={styles.addressText}>{job.pickup_address}</Text>
          </>
        )}

        {job?.destination_address && (
          <>
            <Text style={styles.labelText}>Destination</Text>
            <Text style={styles.addressText}>{job.destination_address}</Text>
          </>
        )}

        <View style={styles.divider}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>
              ${job?.total_amount?.toFixed(2) || '0.00'}
            </Text>
          </View>
        </View>
      </View>

      {/* Cancel Button */}
      <TouchableOpacity
        onPress={handleCancel}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelButtonText}>Cancel Request</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  loadingCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    borderColor: 'rgba(46, 255, 175, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headingText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 15,
  },
  timerText: {
    color: '#2EFFAF',
    fontSize: 18,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
  },
  labelText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginBottom: 8,
  },
  serviceNameText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  addressText: {
    color: '#FFFFFF',
    marginBottom: 16,
    fontSize: 15,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  totalAmount: {
    color: '#2EFFAF',
    fontSize: 24,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  cancelButtonText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 18,
  },
});
