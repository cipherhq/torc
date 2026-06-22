import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Linking, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';
import MapView, { Marker } from 'react-native-maps';

function normalizeStatus(status?: string): string {
  if (status === 'in_progress') return 'inprogress';
  if (status === 'en_route') return 'enroute';
  return status || 'pending';
}

export default function TrackingScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, updateJobStatus, rateJob, fetchProviderStats, subscribeToJobUpdates } = useJob();
  const [job, setJob] = useState<any>(null);
  const [providerStats, setProviderStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const data = await fetchJob(jobId as string);
      setJob(data);

      // Fetch provider stats
      if (data.provider_id) {
        const stats = await fetchProviderStats(data.provider_id);
        setProviderStats(stats);
      }
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchJob, fetchProviderStats, jobId]);

  useEffect(() => {
    if (jobId) {
      loadJob();
      const unsubscribe = subscribeToJobUpdates(jobId as string, () => {
        console.log('Job updated');
        loadJob();
      });
      return unsubscribe;
    }
  }, [jobId, loadJob, subscribeToJobUpdates]);

  const handleCall = () => {
    if (job?.provider?.phone) {
      Linking.openURL(`tel:${job.provider.phone}`);
    } else {
      Alert.alert('Error', 'Provider phone number not available');
    }
  };

  const handleMessage = () => {
    router.push({ pathname: '/webview', params: { initialPath: '/customer/messages' } });
  };

  const handleConfirmArrival = async () => {
    try {
      await updateJobStatus(jobId as string, 'inprogress');
      Alert.alert('Confirmed', 'Provider arrival confirmed!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleConfirmComplete = async () => {
    Alert.alert(
      'Confirm Completion',
      'Has the service been completed?',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, Complete',
          onPress: async () => {
            try {
              await updateJobStatus(jobId as string, 'completed');
              Alert.alert('Success', 'Job marked as complete! Please rate your experience.');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleRating = async (stars: number) => {
    setRating(stars);
    try {
      await rateJob(jobId as string, stars);
      Alert.alert('Thank You!', 'Your rating has been submitted.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
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

  if (!job) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Job not found</Text>
      </View>
    );
  }

  const jobStatus = normalizeStatus(job.status);
  const isCompleted = jobStatus === 'completed';

  return (
    <View style={styles.screenContainer}>
      <MapView
        style={styles.map}
        region={{
          latitude: job.pickup_latitude || 37.78825,
          longitude: job.pickup_longitude || -122.4324,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {job.pickup_latitude && (
          <Marker
            coordinate={{
              latitude: job.pickup_latitude,
              longitude: job.pickup_longitude,
            }}
            title="Pickup"
          />
        )}
        {job.destination_latitude && (
          <Marker
            coordinate={{
              latitude: job.destination_latitude,
              longitude: job.destination_longitude,
            }}
            title="Destination"
            pinColor="blue"
          />
        )}
      </MapView>

      <ScrollView style={styles.scrollContent}>
        <Text style={styles.statusHeading}>
          {isCompleted
            ? 'Job Completed'
            : jobStatus === 'inprogress'
            ? 'Service In Progress'
            : jobStatus === 'arrived'
            ? 'Provider Arrived'
            : 'Provider On The Way'}
        </Text>

        {/* Provider Info */}
        <View style={styles.card}>
          <Text style={styles.providerName}>
            {job.provider?.full_name || job.provider?.first_name || 'Your Provider'}
          </Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>
              {'\u2B50'} {providerStats?.averageRating?.toFixed(1) || 'N/A'}
            </Text>
            <Text style={styles.jobCountText}>
              ({providerStats?.completedCount || 0} jobs)
            </Text>
          </View>

          {job.provider?.phone && (
            <Text style={styles.phoneText}>{job.provider.phone}</Text>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              onPress={handleCall}
              style={styles.callButton}
            >
              <Text style={styles.callButtonText}>{'\uD83D\uDCDE'} Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              style={styles.messageButton}
            >
              <Text style={styles.messageButtonText}>{'\uD83D\uDCAC'} Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Job Details */}
        <View style={styles.card}>
          <Text style={styles.labelText}>Service</Text>
          <Text style={styles.detailValue}>{job.service?.name || 'N/A'}</Text>

          <Text style={styles.labelText}>Pickup</Text>
          <Text style={styles.addressText}>{job.pickup_address || 'N/A'}</Text>

          {job.destination_address && (
            <>
              <Text style={styles.labelText}>Destination</Text>
              <Text style={styles.addressText}>{job.destination_address}</Text>
            </>
          )}

          <View style={styles.divider}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalAmount}>
                ${job.total_amount?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Actions */}
        {jobStatus === 'arrived' && (
          <TouchableOpacity
            onPress={handleConfirmArrival}
            style={styles.primaryActionButton}
          >
            <Text style={styles.primaryActionText}>
              Confirm Provider Arrived
            </Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'inprogress' && (
          <TouchableOpacity
            onPress={handleConfirmComplete}
            style={styles.primaryActionButton}
          >
            <Text style={styles.primaryActionText}>
              Confirm Job Complete
            </Text>
          </TouchableOpacity>
        )}

        {isCompleted && !job.rating && (
          <View style={styles.ratingCard}>
            <Text style={styles.ratingHeading}>Rate Your Experience</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => handleRating(star)}>
                  <Text style={styles.starIcon}>{star <= rating ? '\u2B50' : '\u2606'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isCompleted && job.rating && (
          <TouchableOpacity
            onPress={() => router.replace('/')}
            style={styles.homeButton}
          >
            <Text style={styles.primaryActionText}>Back to Home</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  map: {
    height: '35%',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  statusHeading: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  providerName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingText: {
    color: '#2EFFAF',
    fontSize: 18,
    marginRight: 8,
  },
  jobCountText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  phoneText: {
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
    fontSize: 15,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  callButton: {
    flex: 1,
    backgroundColor: '#2EFFAF',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonText: {
    color: '#0F1419',
    fontWeight: '600',
    fontSize: 15,
  },
  messageButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  labelText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginBottom: 8,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 18,
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
  primaryActionButton: {
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  primaryActionText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: '700',
    fontSize: 18,
  },
  ratingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
  },
  ratingHeading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  starIcon: {
    fontSize: 32,
  },
  homeButton: {
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 32,
  },
});
