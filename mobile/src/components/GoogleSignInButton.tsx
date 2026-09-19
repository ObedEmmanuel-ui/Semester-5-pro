import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { discovery } from 'expo-auth-session/providers/google';
import { authService } from '../services/api';
import { colors } from '../theme/colors';
import { GOOGLE_WEB_CLIENT_ID } from '../config';

WebBrowser.maybeCompleteAuthSession();

const isConfigured = GOOGLE_WEB_CLIENT_ID.length > 0;

interface Props {
  label?: string;
  onSuccess: (data: { user: any; token: string; token_type: string }) => void;
}

/**
 * "Continue with Google" — uses expo-auth-session's generic OAuth request
 * (not the deprecated Google-specific hooks) to get an ID token, then hands
 * it to the backend's /auth/google endpoint for verification. Works in
 * Expo Go without a custom dev client, but needs a real Google OAuth "Web"
 * client ID configured in src/config.ts to actually authenticate — see
 * that file for setup steps. Until then, tapping it explains what's
 * missing instead of hitting a confusing Google error page.
 */
export function GoogleSignInButton({ label = 'Continue with Google', onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri();

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_WEB_CLIENT_ID || 'not-configured',
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      scopes: ['openid', 'profile', 'email'],
      usePKCE: false,
      extraParams: {
        nonce: Math.random().toString(36).slice(2),
      },
    },
    discovery
  );

  const handlePress = async () => {
    if (!isConfigured) {
      console.log('Google Sign-In redirect URI:', redirectUri);
      Alert.alert(
        'Google Sign-In not set up',
        'This needs a Google OAuth client ID. See the setup steps in mobile/src/config.ts (the exact redirect URI to register was just printed to the console).'
      );
      return;
    }

    setLoading(true);
    try {
      const result = await promptAsync();

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      if (result.type !== 'success' || !result.params?.id_token) {
        throw new Error('Google sign-in did not complete.');
      }

      const data = await authService.loginWithGoogle(result.params.id_token);
      onSuccess(data);
    } catch (err: any) {
      Alert.alert(
        'Google Sign-In Failed',
        err.response?.data?.message || err.message || 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      disabled={loading || (isConfigured && !request)}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          <Text style={styles.gIcon}>G</Text>
          <Text style={styles.text}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
  },
  gIcon: {
    color: colors.primaryLight,
    fontWeight: '800',
    fontSize: 16,
  },
  text: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
});
