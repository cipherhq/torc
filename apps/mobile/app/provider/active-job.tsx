import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';
import MapView, { Marker } from 'react-native-maps';

function normalizeStatus(status?: string): string {
  if (status === 'in_progress') return 'inprogress';
  if (status === 'en_route') return 'enroute';
  return status || 'accepted';
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  accepted: { bg: 'rgba(234,179,8,0.2)', text: '#EAB308' },
  arrived: { bg: 'rgba(6,182,212,0.2)', text: '#06B6D4' },
  inprogress: { bg: 'rgba(59,130,246,0.2)', text: '#3B82F6' },
  default: { bg: 'rgba(34,197,94,0.2)', text: '#22C55E' },
};

function getStatusColors(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

export default function ActiveJobScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, updateJobStatus, subscribeToJobUpdates } = useJob();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    try {
      const data = await fetchJob(jobId as string);
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchJob, jobId]);

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

  const handleStartJob = async () => {
    try {
      await updateJobStatus(jobId as string, 'inprogress');
      Alert.alert('Success', 'Job started!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCompleteJob = async () => {
    try {
      await updateJobStatus(jobId as string, 'completed');
      Alert.alert('Success', 'Job completed! Great work!', [
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
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackButton}>
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const jobStatus = normalizeStatus(job.status);
  const statusColors = getStatusColors(jobStatus);

  return (
    <View style={styles.container}>
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

      <ScrollView style={styles.scrollContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Active Job</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {jobStatus.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Service</Text>
            <Text style={styles.value}>{job.service?.name || 'N/A'}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Pickup</Text>
            <Text style={styles.valueSmall}>{job.pickup_address || 'N/A'}</Text>
          </View>

          {job.destination_address && (
            <View style={styles.infoBlock}>
              <Text style={styles.label}>Destination</Text>
              <Text style={styles.valueSmall}>{job.destination_address}</Text>
            </View>
          )}

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>
              {job.customer?.full_name || job.customer?.first_name || 'Customer'}
            </Text>
            {job.customer?.phone && (
              <Text style={styles.customerPhone}>{job.customer.phone}</Text>
            )}
          </View>

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

        {jobStatus === 'accepted' && (
          <TouchableOpacity
            onPress={async () => {
              try {
                await updateJobStatus(jobId as string, 'arrived');
                Alert.alert('Success', 'Marked as arrived. Waiting for customer confirmation.');
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            }}
            style={styles.arrivedButton}
          >
            <Text style={styles.actionButtonText}>I've Arrived</Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'arrived' && (
          <TouchableOpacity
            onPress={handleStartJob}
            style={styles.primaryActionButton}
          >
            <Text style={styles.actionButtonText}>Start Job</Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'inprogress' && (
          <TouchableOpacity
            onPress={handleCompleteJob}
            style={styles.primaryActionButton}
          >
            <Text style={styles.actionButtonText}>Complete Job</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
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
    height: '35%',
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
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
  customerPhone: {
    color: '#2EFFAF',
  },
  payoutAmount: {
    color: '#2EFFAF',
    fontSize: 24,
    fontWeight: '700',
  },
  arrivedButton: {
    backgroundColor: '#06B6D4',
    paddingVertical: 16,
    borderRadius: 20,
    marginBottom: 16,
  },
  primaryActionButton: {
    backgroundColor: '#2EFFAF',
    paddingVertical: 16,
    borderRadius: 20,
    marginBottom: 16,
  },
  actionButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: '700',
    fontSize: 18,
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 16,
    borderRadius: 20,
    marginBottom: 32,
  },
  backButtonText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
