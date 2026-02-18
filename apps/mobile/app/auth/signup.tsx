import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
      });
      Alert.alert('Success', 'Account created! Please check your email to verify.');
      router.replace('/auth/login');
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0F1419] px-6 justify-center">
      <View className="mb-6">
        <Text className="text-4xl font-bold text-white mb-2">Create Account</Text>
        <Text className="text-white/60 text-lg">Sign up to get started</Text>
      </View>

      <View className="space-y-3">
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First Name"
          placeholderTextColor="#666"
          className="bg-white/10 text-white px-4 py-3 rounded-2xl"
        />

        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last Name"
          placeholderTextColor="#666"
          className="bg-white/10 text-white px-4 py-3 rounded-2xl"
        />

        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone Number"
          keyboardType="phone-pad"
          placeholderTextColor="#666"
          className="bg-white/10 text-white px-4 py-3 rounded-2xl"
        />

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#666"
          className="bg-white/10 text-white px-4 py-3 rounded-2xl"
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#666"
          className="bg-white/10 text-white px-4 py-3 rounded-2xl"
        />

        <View className="flex-row gap-2 mt-2">
          <TouchableOpacity
            onPress={() => setRole('customer')}
            className={`flex-1 py-3 rounded-2xl ${role === 'customer' ? 'bg-[#2EFFAF]' : 'bg-white/10'}`}
          >
            <Text className={`text-center font-semibold ${role === 'customer' ? 'text-[#0F1419]' : 'text-white'}`}>
              Customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRole('provider')}
            className={`flex-1 py-3 rounded-2xl ${role === 'provider' ? 'bg-[#2EFFAF]' : 'bg-white/10'}`}
          >
            <Text className={`text-center font-semibold ${role === 'provider' ? 'text-[#0F1419]' : 'text-white'}`}>
              Provider
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          className="bg-[#2EFFAF] rounded-2xl py-4 mt-4"
        >
          <Text className="text-center text-[#0F1419] font-bold text-lg">
            {loading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          className="mt-4"
        >
          <Text className="text-center text-white/60">
            Already have an account? <Text className="text-[#2EFFAF]">Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
