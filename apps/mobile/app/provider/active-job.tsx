import { View, Text, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';
import MapView, { Marker } from 'react-native-maps';

function normalizeStatus(status?: string): string {
  if (status === 'in_progress') return 'inprogress';
  if (status === 'en_route') return 'enroute';
  return status || 'accepted';
}

export default function ActiveJobScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, updateJobStatus, subscribeToJobUpdates } = useJob();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (jobId) {
      loadJob();
      const unsubscribe = subscribeToJobUpdates(jobId as string, () => {
        console.log('Job updated');
        loadJob();
      });
      return unsubscribe;
    }
  }, [jobId]);

  const loadJob = async () => {
    try {
      const data = await fetchJob(jobId as string);
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
    } finally {
      setLoading(false);
    }
  };

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
      <View className="flex-1 bg-[#0F1419] items-center justify-center">
        <ActivityIndicator size="large" color="#2EFFAF" />
      </View>
    );
  }

  if (!job) {
    return (
      <View className="flex-1 bg-[#0F1419] items-center justify-center px-6">
        <Text className="text-white text-lg">Job not found</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-[#2EFFAF] px-6 py-3 rounded-xl">
          <Text className="text-[#0F1419] font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const jobStatus = normalizeStatus(job.status);

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
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-3xl font-bold">Active Job</Text>
          <View className={`px-4 py-2 rounded-full ${
            jobStatus === 'accepted' ? 'bg-yellow-500/20' :
            jobStatus === 'arrived' ? 'bg-cyan-500/20' :
            jobStatus === 'inprogress' ? 'bg-blue-500/20' :
            'bg-green-500/20'
          }`}>
            <Text className={`text-sm font-semibold ${
              jobStatus === 'accepted' ? 'text-yellow-500' :
              jobStatus === 'arrived' ? 'text-cyan-500' :
              jobStatus === 'inprogress' ? 'text-blue-500' :
              'text-green-500'
            }`}>
              {jobStatus.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View className="space-y-4 mb-6">
          <View>
            <Text className="text-white/60 text-sm">Service</Text>
            <Text className="text-white text-lg">{job.service?.name || 'N/A'}</Text>
          </View>

          <View>
            <Text className="text-white/60 text-sm">Pickup</Text>
            <Text className="text-white">{job.pickup_address || 'N/A'}</Text>
          </View>

          {job.destination_address && (
            <View>
              <Text className="text-white/60 text-sm">Destination</Text>
              <Text className="text-white">{job.destination_address}</Text>
            </View>
          )}

          <View>
            <Text className="text-white/60 text-sm">Customer</Text>
            <Text className="text-white text-lg">
              {job.customer?.full_name || job.customer?.first_name || 'Customer'}
            </Text>
            {job.customer?.phone && (
              <Text className="text-[#2EFFAF]">{job.customer.phone}</Text>
            )}
          </View>

          <View>
            <Text className="text-white/60 text-sm">Customer Notes</Text>
            <Text className="text-white">{job.customer_notes || 'None'}</Text>
          </View>

          <View>
            <Text className="text-white/60 text-sm">Payout</Text>
            <Text className="text-[#2EFFAF] text-2xl font-bold">
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
            className="bg-cyan-500 py-4 rounded-2xl mb-4"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">I've Arrived</Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'arrived' && (
          <TouchableOpacity
            onPress={handleStartJob}
            className="bg-[#2EFFAF] py-4 rounded-2xl mb-4"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">Start Job</Text>
          </TouchableOpacity>
        )}

        {jobStatus === 'inprogress' && (
          <TouchableOpacity
            onPress={handleCompleteJob}
            className="bg-[#2EFFAF] py-4 rounded-2xl mb-4"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">Complete Job</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-white/10 py-4 rounded-2xl mb-8"
        >
          <Text className="text-center text-white font-semibold">Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
