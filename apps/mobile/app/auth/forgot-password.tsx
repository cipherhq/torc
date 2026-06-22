import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://www.torcapp.com/auth/reset-password',
      });
      if (error) throw error;
      setSent(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.sentContainer} edges={['top', 'bottom']}>
        <Text style={styles.sentIcon}>✓</Text>
        <Text style={styles.sentTitle}>Check Your Email</Text>
        <Text style={styles.sentDescription}>
          We sent a password reset link to {email}. Follow the link to set a new password.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/auth/login')}
          style={styles.backToSignInButton}
        >
          <Text style={styles.backToSignInButtonText}>Back to Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </Text>
          </View>

          <View style={styles.formSection}>
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="your@email.com"
                placeholderTextColor="#666"
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              onPress={handleReset}
              disabled={loading}
              style={[styles.resetButton, loading && styles.resetButtonDisabled]}
            >
              <Text style={styles.resetButtonText}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>
                Back to <Text style={styles.backLinkHighlight}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerSection: {
    marginBottom: 32,
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
    lineHeight: 26,
  },
  formSection: {
    gap: 16,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
    fontSize: 15,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    fontSize: 16,
  },
  resetButton: {
    backgroundColor: '#2EFFAF',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 8,
  },
  resetButtonDisabled: {
    opacity: 0.6,
  },
  resetButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
  },
  backLink: {
    marginTop: 8,
  },
  backLinkText: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  backLinkHighlight: {
    color: '#2EFFAF',
    fontWeight: '600',
  },
  sentContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sentIcon: {
    color: '#2EFFAF',
    fontSize: 48,
    marginBottom: 24,
  },
  sentTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  sentDescription: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
    fontSize: 16,
    lineHeight: 24,
  },
  backToSignInButton: {
    backgroundColor: '#2EFFAF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  backToSignInButtonText: {
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
    textAlign: 'center',
  },
});
