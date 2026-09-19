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

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await authService.login(email, password);
      navigation.replace('Main');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Login Failed',
        error.response?.data?.message || 'Invalid email or password. Please try again.'
      );
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
            <AppLogo size={88} />
          </View>
          <Text style={styles.title}>MproWave</Text>
          <Text style={styles.subtitle}>AI-Assisted Mobile DAW</Text>

          <View style={styles.form}>
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
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.forgotPasswordLink}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <GoogleSignInButton onSuccess={() => navigation.replace('Main')} />

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.linkTextBold}>Register</Text>
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
    paddingVertical: 30,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 50,
  },
  form: {
    width: '100%',
  },
  inputSpacing: {
    marginBottom: 15,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: -4,
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
