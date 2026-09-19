import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { authService } from '../services/api';
import { ThemedInput } from '../components/ThemedInput';
import { FloatingParticles } from '../components/FloatingParticles';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { AppLogo } from '../components/AppLogo';
import { colors, heroGradient } from '../theme/colors';

export const RegisterScreen = ({ navigation }: any) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await authService.register(name, email, password, confirmPassword);
      Alert.alert('Success', 'Account created successfully!', [
        { text: 'OK', onPress: () => navigation.replace('Main') }
      ]);
    } catch (error: any) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.errors?.email?.[0] ||
                          'Registration failed. Please try again.';
      Alert.alert('Registration Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <FloatingParticles count={16} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.logoWrap}>
              <AppLogo size={76} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join MproWave today</Text>

            <View style={styles.form}>
              <ThemedInput
                themeColors={colors}
                style={styles.inputSpacing}
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              <ThemedInput
                themeColors={colors}
                style={styles.inputSpacing}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <ThemedInput
                themeColors={colors}
                style={styles.inputSpacing}
                placeholder="Password (min 8 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <ThemedInput
                themeColors={colors}
                style={styles.inputSpacing}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Register</Text>
                )}
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleSignInButton label="Sign up with Google" onSuccess={() => navigation.replace('Main')} />

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.linkText}>
                  Already have an account? <Text style={styles.linkTextBold}>Login</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 50,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
  },
  inputSpacing: {
    marginBottom: 15,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(245, 239, 230, 0.12)',
  },
  dividerText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: 12,
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  linkTextBold: {
    color: colors.primaryLight,
    fontWeight: '600',
  },
});
