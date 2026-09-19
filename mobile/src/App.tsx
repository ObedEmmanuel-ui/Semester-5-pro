import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { EditorScreen } from './screens/EditorScreen';
import { AddTrackScreen } from './screens/AddTrackScreen';
import { InstrumentScreen } from './screens/InstrumentScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { ProjectChatScreen } from './screens/ProjectChatScreen';
import { VoiceMemoStudioScreen } from './screens/VoiceMemoStudioScreen';
import { DiscoverProducersScreen } from './screens/DiscoverProducersScreen';
import { ProducerProfileScreen } from './screens/ProducerProfileScreen';
import { FollowListScreen } from './screens/FollowListScreen';
import { ProjectCommentsScreen } from './screens/ProjectCommentsScreen';
import { MainTabs } from './navigation/MainTabs';
import { ThemeProvider } from './theme/ThemeContext';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Main: undefined;
  Editor: { projectId: number };
  AddTrack: undefined;
  Instrument: undefined;
  Settings: undefined;
  Notifications: undefined;
  Player: { projectId: number; trackId: number };
  ProjectChat: { projectId: number };
  VoiceMemoStudio: undefined;
  DiscoverProducers: undefined;
  ProducerProfile: { userId: number };
  FollowList: { userId: number; mode: 'followers' | 'following'; name: string };
  ProjectComments: { projectId: number; projectName?: string };
};

const Stack = createStackNavigator<RootStackParamList>();

const App = () => {
  // The splash + onboarding carousel always play on every cold launch (per
  // explicit product decision — most apps gate onboarding behind a
  // "seen it once" flag, this one deliberately doesn't). Whether an
  // already-authenticated user lands on Login/Register or skips straight
  // to Main is decided inside OnboardingScreen itself, from its own
  // auth-token check, once the user taps through.
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Splash"
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="Splash" component={SplashScreen} />
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Editor" component={EditorScreen} />
              <Stack.Screen name="AddTrack" component={AddTrackScreen} />
              <Stack.Screen name="Instrument" component={InstrumentScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Player" component={PlayerScreen} />
              <Stack.Screen name="ProjectChat" component={ProjectChatScreen} />
              <Stack.Screen name="VoiceMemoStudio" component={VoiceMemoStudioScreen} />
              <Stack.Screen name="DiscoverProducers" component={DiscoverProducersScreen} />
              <Stack.Screen name="ProducerProfile" component={ProducerProfileScreen} />
              <Stack.Screen name="FollowList" component={FollowListScreen} />
              <Stack.Screen name="ProjectComments" component={ProjectCommentsScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

export default App;
