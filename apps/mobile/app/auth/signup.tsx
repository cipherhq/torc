import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsVersion, setTermsVersion] = useState('v1.0.0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadTermsVersion() {
      const { data } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'terms_version')
        .maybeSingle();
      if (active && data?.value) {
        setTermsVersion(String(data.value));
      }
    }
    loadTermsVersion().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const openLegalLink = async (path: '/terms' | '/privacy') => {
    const roleParam = role === 'provider' ? 'provider' : 'customer';
    await WebBrowser.openBrowserAsync(`https://www.torcapp.com${path}?role=${roleParam}`);
  };

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    if (!acceptedTerms) {
      Alert.alert('Terms Required', 'Please accept the Terms and Privacy Policy to continue.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, {
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        accepted_terms: true,
        terms_version: termsVersion,
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

        <View className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10">
          <TouchableOpacity
            onPress={() => setAcceptedTerms((prev) => !prev)}
            className="flex-row items-start"
            activeOpacity={0.8}
          >
            <View
              className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${acceptedTerms ? 'bg-[#2EFFAF] border-[#2EFFAF]' : 'border-white/40'}`}
            >
              {acceptedTerms && <Text className="text-[#0F1419] text-xs font-bold">✓</Text>}
            </View>
            <Text className="text-white/70 flex-1">
              I agree to TORC&apos;s Terms of Service and Privacy Policy.
            </Text>
          </TouchableOpacity>
          <View className="flex-row mt-3 gap-4">
            <TouchableOpacity onPress={() => openLegalLink('/terms')}>
              <Text className="text-[#2EFFAF] text-sm font-semibold">View Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openLegalLink('/privacy')}>
              <Text className="text-[#2EFFAF] text-sm font-semibold">View Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          className={`rounded-2xl py-4 mt-4 ${acceptedTerms ? 'bg-[#2EFFAF]' : 'bg-[#2EFFAF]/40'}`}
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
