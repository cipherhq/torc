import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useJob } from '../../contexts/JobContext';
import { supabase } from '../../lib/supabase';

export default function MatchingScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { fetchJob, cancelJob, subscribeToJobUpdates } = useJob();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeWaiting, setTimeWaiting] = useState(0);

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
  }, [jobId]);

  const loadJob = async () => {
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
  };

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
      <View className="flex-1 bg-[#0F1419] items-center justify-center">
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
    <View className="flex-1 bg-[#0F1419] px-6 justify-center items-center">
      {/* Animated Loading Circle */}
      <View className="items-center mb-12">
        <View className="w-32 h-32 rounded-full border-4 border-[#2EFFAF]/30 items-center justify-center mb-4">
          <ActivityIndicator size="large" color="#2EFFAF" />
        </View>
        <Text className="text-white text-2xl font-bold mb-2">Finding Provider...</Text>
        <Text className="text-white/60 text-center mb-4">
          We're matching you with the best available provider
        </Text>
        <Text className="text-[#2EFFAF] text-lg font-semibold">
          {formatTime(timeWaiting)}
        </Text>
      </View>

      {/* Job Details */}
      <View className="w-full bg-white/5 rounded-3xl p-6 mb-8">
        <Text className="text-white/60 text-sm mb-2">Service</Text>
        <Text className="text-white text-xl font-semibold mb-4">
          {job?.service?.name || 'Service Request'}
        </Text>

        {job?.pickup_address && (
          <>
            <Text className="text-white/60 text-sm mb-2">Pickup</Text>
            <Text className="text-white mb-4">{job.pickup_address}</Text>
          </>
        )}

        {job?.destination_address && (
          <>
            <Text className="text-white/60 text-sm mb-2">Destination</Text>
            <Text className="text-white mb-4">{job.destination_address}</Text>
          </>
        )}

        <View className="border-t border-white/10 pt-4 mt-2">
          <View className="flex-row justify-between items-center">
            <Text className="text-white/60">Total</Text>
            <Text className="text-[#2EFFAF] text-2xl font-bold">
              ${job?.total_amount?.toFixed(2) || '0.00'}
            </Text>
          </View>
        </View>
      </View>

      {/* Cancel Button */}
      <TouchableOpacity
        onPress={handleCancel}
        className="bg-red-500/20 px-8 py-4 rounded-2xl"
      >
        <Text className="text-red-500 font-semibold text-lg">Cancel Request</Text>
      </TouchableOpacity>
    </View>
  );
}
