import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0F1419] px-6 justify-center">
      <View className="mb-8">
        <Text className="text-4xl font-bold text-white mb-2">Welcome Back</Text>
        <Text className="text-white/60 text-lg">Sign in to continue</Text>
      </View>

      <View className="space-y-4">
        <View>
          <Text className="text-white/80 mb-2">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="your@email.com"
            placeholderTextColor="#666"
            className="bg-white/10 text-white px-4 py-4 rounded-2xl"
          />
        </View>

        <View>
          <Text className="text-white/80 mb-2">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#666"
            className="bg-white/10 text-white px-4 py-4 rounded-2xl"
          />
        </View>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-4 mt-4"
          style={{ backgroundColor: '#2EFFAF' }}
        >
          <Text className="text-center text-[#0F1419] font-bold text-lg">
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/signup')}
          className="mt-4"
        >
          <Text className="text-center text-[#2EFFAF]">
            Don&apos;t have an account? Sign Up
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
