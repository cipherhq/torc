import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Linking } from 'react-native';
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
      <View className="flex-1 bg-[#0F1419] items-center justify-center">
        <ActivityIndicator size="large" color="#2EFFAF" />
      </View>
    );
  }

  if (!job) {
    return (
      <View className="flex-1 bg-[#0F1419] items-center justify-center px-6">
        <Text className="text-white text-lg">Job not found</Text>
      </View>
    );
  }

  const jobStatus = normalizeStatus(job.status);
  const isCompleted = jobStatus === 'completed';

  return (
    <View className="flex-1 bg-[#0F1419]">
      <MapView
        style={{ height: '35%' }}
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

      <ScrollView className="flex-1 px-6 pt-6">
        <Text className="text-white text-3xl font-bold mb-4">
          {isCompleted
            ? 'Job Completed'
            : jobStatus === 'inprogress'
            ? 'Service In Progress'
            : jobStatus === 'arrived'
            ? 'Provider Arrived'
            : 'Provider On The Way'}
        </Text>

        {/* Provider Info */}
        <View className="bg-white/5 rounded-3xl p-6 mb-4">
          <Text className="text-white text-xl font-bold mb-2">
            {job.provider?.full_name || job.provider?.first_name || 'Your Provider'}
          </Text>
          <View className="flex-row items-center mb-4">
            <Text className="text-[#2EFFAF] text-lg mr-2">
              ⭐ {providerStats?.averageRating?.toFixed(1) || 'N/A'}
            </Text>
            <Text className="text-white/60">
              ({providerStats?.completedCount || 0} jobs)
            </Text>
          </View>

          {job.provider?.phone && (
            <Text className="text-white/60 mb-4">{job.provider.phone}</Text>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleCall}
              className="flex-1 bg-[#2EFFAF] py-3 rounded-xl flex-row items-center justify-center"
            >
              <Text className="text-[#0F1419] font-semibold">📞 Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMessage}
              className="flex-1 bg-white/10 py-3 rounded-xl flex-row items-center justify-center"
            >
              <Text className="text-white font-semibold">💬 Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Job Details */}
        <View className="bg-white/5 rounded-3xl p-6 mb-4">
          <Text className="text-white/60 text-sm mb-2">Service</Text>
          <Text className="text-white text-lg mb-4">{job.service?.name || 'N/A'}</Text>

          <Text className="text-white/60 text-sm mb-2">Pickup</Text>
          <Text className="text-white mb-4">{job.pickup_address || 'N/A'}</Text>

          {job.destination_address && (
            <>
              <Text className="text-white/60 text-sm mb-2">Destination</Text>
              <Text className="text-white mb-4">{job.destination_address}</Text>
            </>
          )}

          <View className="border-t border-white/10 pt-4 mt-2">
            <View className="flex-row justify-between items-center">
              <Text className="text-white/60">Total</Text>
              <Text className="text-[#2EFFAF] text-2xl font-bold">
                ${job.total_amount?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Actions */}
        {jobStatus === 'arrived' && (
          <TouchableOpacity
            onPress={handleConfirmArrival}
            className="bg-[#2EFFAF] py-4 rounded-2xl mb-4"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">
              Confirm Provider Arrived
            </Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'inprogress' && (
          <TouchableOpacity
            onPress={handleConfirmComplete}
            className="bg-[#2EFFAF] py-4 rounded-2xl mb-4"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">
              Confirm Job Complete
            </Text>
          </TouchableOpacity>
        )}

        {isCompleted && !job.rating && (
          <View className="bg-white/5 rounded-3xl p-6 mb-8">
            <Text className="text-white text-xl font-bold mb-4 text-center">Rate Your Experience</Text>
            <View className="flex-row justify-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => handleRating(star)}>
                  <Text className="text-4xl">{star <= rating ? '⭐' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isCompleted && job.rating && (
          <TouchableOpacity
            onPress={() => router.replace('/')}
            className="bg-[#2EFFAF] py-4 rounded-2xl mb-8"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">Back to Home</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
