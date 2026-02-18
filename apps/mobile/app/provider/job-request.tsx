import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (jobId) {
      loadJob();
    }
  }, [jobId]);

  const loadJob = async () => {
    try {
      const data = await fetchJob(jobId as string);
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <View className="flex-1 bg-[#0F1419]">
      {/* Map */}
      <MapView
        style={{ height: '40%' }}
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
      <View className="flex-1 px-6 pt-6">
        <Text className="text-white text-3xl font-bold mb-2">New Job Request</Text>
        <Text className="text-white/60 mb-6">{job.service?.name || 'Service'}</Text>

        <View className="space-y-4 mb-6">
          <View>
            <Text className="text-white/60 text-sm">Pickup</Text>
            <Text className="text-white text-lg">{job.pickup_address || 'N/A'}</Text>
          </View>

          {job.destination_address && (
            <View>
              <Text className="text-white/60 text-sm">Destination</Text>
              <Text className="text-white text-lg">{job.destination_address}</Text>
            </View>
          )}

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

        {/* Action Buttons */}
        <View className="flex-row gap-4">
          <TouchableOpacity
            onPress={handleDecline}
            disabled={accepting}
            className="flex-1 bg-white/10 py-4 rounded-2xl"
          >
            <Text className="text-center text-white font-semibold text-lg">Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAccept}
            disabled={accepting}
            className="flex-1 bg-[#2EFFAF] py-4 rounded-2xl"
          >
            <Text className="text-center text-[#0F1419] font-bold text-lg">
              {accepting ? 'Accepting...' : 'Accept'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
