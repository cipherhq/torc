import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet } from 'react-native';
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
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerSection}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Sign up to get started</Text>
      </View>

      <View style={styles.formSection}>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First Name"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last Name"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone Number"
          keyboardType="phone-pad"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <View style={styles.roleRow}>
          <TouchableOpacity
            onPress={() => setRole('customer')}
            style={[
              styles.roleButton,
              role === 'customer' ? styles.roleButtonActive : styles.roleButtonInactive,
            ]}
          >
            <Text
              style={[
                styles.roleButtonText,
                role === 'customer' ? styles.roleTextActive : styles.roleTextInactive,
              ]}
            >
              Customer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRole('provider')}
            style={[
              styles.roleButton,
              role === 'provider' ? styles.roleButtonActive : styles.roleButtonInactive,
            ]}
          >
            <Text
              style={[
                styles.roleButtonText,
                role === 'provider' ? styles.roleTextActive : styles.roleTextInactive,
              ]}
            >
              Provider
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.termsContainer}>
          <TouchableOpacity
            onPress={() => setAcceptedTerms((prev) => !prev)}
            style={styles.termsRow}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.checkbox,
                acceptedTerms ? styles.checkboxChecked : styles.checkboxUnchecked,
              ]}
            >
              {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              I agree to TORC&apos;s Terms of Service and Privacy Policy.
            </Text>
          </TouchableOpacity>
          <View style={styles.legalLinksRow}>
            <TouchableOpacity onPress={() => openLegalLink('/terms')}>
              <Text style={styles.legalLinkText}>View Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openLegalLink('/privacy')}>
              <Text style={styles.legalLinkText}>View Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          style={[
            styles.signUpButton,
            !acceptedTerms && styles.signUpButtonDisabled,
          ]}
        >
          <Text style={styles.signUpButtonText}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/login')}
          style={styles.signInLink}
        >
          <Text style={styles.signInText}>
            Already have an account? <Text style={styles.signInHighlight}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  headerSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
  },
  formSection: {
    gap: 12,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    fontSize: 16,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#2EFFAF',
  },
  roleButtonInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  roleButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  roleTextActive: {
    color: '#0F1419',
  },
  roleTextInactive: {
    color: '#FFFFFF',
  },
  termsContainer: {
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    marginRight: 12,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2EFFAF',
    borderColor: '#2EFFAF',
  },
  checkboxUnchecked: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  checkmark: {
    color: '#0F1419',
    fontSize: 12,
    fontWeight: 'bold',
  },
  termsText: {
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  legalLinksRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  legalLinkText: {
    color: '#2EFFAF',
    fontSize: 14,
    fontWeight: '600',
  },
  signUpButton: {
    backgroundColor: '#2EFFAF',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 4,
  },
  signUpButtonDisabled: {
    opacity: 0.4,
  },
  signUpButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
  },
  signInLink: {
    marginTop: 8,
  },
  signInText: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  signInHighlight: {
    color: '#2EFFAF',
    fontWeight: '600',
  },
});
