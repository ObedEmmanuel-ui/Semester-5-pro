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
import { Ionicons } from '@expo/vector-icons';
import { authService } from '../services/api';
import { ThemedInput } from '../components/ThemedInput';
import { FloatingParticles } from '../components/FloatingParticles';
import { colors, heroGradient } from '../theme/colors';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  // Step 1: request a code by email. Step 2: enter that code + a new
  // password. Kept as one screen (rather than a second route) since the
  // email carries over naturally and there's nothing else to navigate to
  // in between.
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setStep('reset');
      Alert.alert(
        'Check your email',
        "If an account exists for that email, we've sent a 6-digit reset code. It expires in 60 minutes."
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim() || !password || !confirmPassword) {
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
      await authService.resetPassword({
        email: email.trim(),
        code: code.trim(),
        password,
        password_confirmation: confirmPassword,
      });
      Alert.alert('Success', 'Your password has been reset.', [
        { text: 'OK', onPress: () => navigation.replace('Main') },
      ]);
    } catch (error: any) {
      const message =
        error.response?.data?.errors?.code?.[0] ||
        error.response?.data?.message ||
        'Failed to reset password. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <FloatingParticles count={16} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.title}>{step === 'request' ? 'Forgot Password' : 'Reset Password'}</Text>
            <Text style={styles.subtitle}>
              {step === 'request'
                ? "Enter your account's email and we'll send you a reset code"
                : `Enter the code sent to ${email.trim()} and choose a new password`}
            </Text>

            <View style={styles.form}>
              {step === 'request' ? (
                <>
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
                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleRequestCode}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <Text style={styles.buttonText}>Send Reset Code</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ThemedInput
                    themeColors={colors}
                    style={styles.inputSpacing}
                    placeholder="6-digit code"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <ThemedInput
                    themeColors={colors}
                    style={styles.inputSpacing}
                    placeholder="New password (min 8 characters)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  <ThemedInput
                    themeColors={colors}
                    style={styles.inputSpacing}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <Text style={styles.buttonText}>Reset Password</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkButton} onPress={handleRequestCode} disabled={loading}>
                    <Text style={styles.linkText}>Didn&apos;t get a code? Resend</Text>
                  </TouchableOpacity>
                </>
              )}
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
    paddingVertical: 30,
  },
  backButton: {
    position: 'absolute',
    top: 30,
    left: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 10,
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
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
