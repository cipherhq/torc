import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
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
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.formSection}>
        <View style={styles.fieldGroup}>
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

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#666"
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          onPress={() => router.push('/auth/forgot-password')}
          style={styles.forgotPasswordLink}
        >
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          style={[styles.signInButton, loading && styles.signInButtonDisabled]}
        >
          <Text style={styles.signInButtonText}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/signup')}
          style={styles.signUpLink}
        >
          <Text style={styles.signUpText}>
            Don&apos;t have an account? <Text style={styles.signUpHighlight}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
    paddingHorizontal: 24,
    justifyContent: 'center',
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
  },
  formSection: {
    gap: 16,
  },
  fieldGroup: {
    marginBottom: 0,
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
  forgotPasswordLink: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    color: '#2EFFAF',
    fontSize: 14,
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: '#2EFFAF',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 8,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    textAlign: 'center',
    color: '#0F1419',
    fontWeight: 'bold',
    fontSize: 18,
  },
  signUpLink: {
    marginTop: 8,
  },
  signUpText: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  signUpHighlight: {
    color: '#2EFFAF',
    fontWeight: '600',
  },
});
