import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';
import { useAuth } from '../../contexts/AuthContext';
import MapView, { Marker } from 'react-native-maps';

export default function JobRequestScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, acceptJob } = useJob();
  const { user } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const data = await fetchJob(jobId as string);
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [fetchJob, jobId]);

  useEffect(() => {
    if (jobId) {
      loadJob();
    }
  }, [jobId, loadJob]);

  const handleAccept = async () => {
    if (!user || !jobId) return;

    setAccepting(true);
    try {
      await acceptJob(jobId as string, user.id);
      Alert.alert('Success', 'Job accepted! Customer will be notified.');
      router.replace(`/provider/active-job?jobId=${jobId}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not accept job');
      router.back();
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    Alert.alert('Job Declined', 'Job declined.');
    router.back();
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
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackButton}>
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
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

      {/* Job Details */}
      <View style={styles.detailsContainer}>
        <Text style={styles.title}>New Job Request</Text>
        <Text style={styles.subtitle}>{job.service?.name || 'Service'}</Text>

        <View style={styles.infoSection}>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Pickup</Text>
            <Text style={styles.value}>{job.pickup_address || 'N/A'}</Text>
          </View>

          {job.destination_address && (
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Destination</Text>
              <Text style={styles.value}>{job.destination_address}</Text>
            </View>
          )}

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Customer Notes</Text>
            <Text style={styles.valueSmall}>{job.customer_notes || 'None'}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Payout</Text>
            <Text style={styles.payoutAmount}>
              ${job.total_amount?.toFixed(2) || '0.00'}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            onPress={handleDecline}
            disabled={accepting}
            style={styles.declineButton}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAccept}
            disabled={accepting}
            style={styles.acceptButton}
          >
            <Text style={styles.acceptButtonText}>
              {accepting ? 'Accepting...' : 'Accept'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
  goBackButton: {
    marginTop: 16,
    backgroundColor: '#2EFFAF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  goBackButtonText: {
    color: '#0F1419',
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  map: {
    height: '40%',
  },
  detailsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 24,
  },
  infoSection: {
    gap: 16,
    marginBottom: 24,
  },
  infoBlock: {},
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  valueSmall: {
    color: '#FFFFFF',
  },
  payoutAmount: {
    color: '#2EFFAF',
    fontSize: 24,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  declineButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 16,
    borderRadius: 20,
  },
  declineButtonText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 18,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    borderRadius: 20,
  },
  acceptButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: '700',
    fontSize: 18,
  },
});
