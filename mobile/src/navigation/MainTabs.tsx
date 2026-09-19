import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { ProjectsScreen } from '../screens/ProjectsScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { AIAssistantScreen } from '../screens/AIAssistantScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';

export type MainTabParamList = {
  Home: undefined;
  Projects: undefined;
  Library: undefined;
  AIAssistant: { editTrack?: { id: number; type: string; name: string; midi_data?: any } } | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Real vector icons that swap between an outline and a filled glyph on
// focus (the same convention iOS/Material tab bars use), instead of
// relying on emoji — which render inconsistently across devices and don't
// have a distinct "active" state of their own.
const TAB_ICONS: Record<keyof MainTabParamList, { focused: string; unfocused: string }> = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  Projects: { focused: 'folder', unfocused: 'folder-outline' },
  Library: { focused: 'library', unfocused: 'library-outline' },
  AIAssistant: { focused: 'sparkles', unfocused: 'sparkles-outline' },
  Profile: { focused: 'person-circle', unfocused: 'person-circle-outline' },
};

const TAB_LABELS: Record<keyof MainTabParamList, string> = {
  Home: 'Home',
  Projects: 'Projects',
  Library: 'Library',
  AIAssistant: 'AI',
  Profile: 'Profile',
};

function TabIcon({ route, color, focused }: { route: keyof MainTabParamList; color: string; focused: boolean }) {
  const icon = TAB_ICONS[route];
  const name = focused ? icon.focused : icon.unfocused;
  const size = focused ? 25 : 23;

  return (
    <View style={{ opacity: focused ? 1 : 0.85 }}>
      <Ionicons name={name as any} size={size} color={color} />
    </View>
  );
}

export const MainTabs = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // In landscape the home indicator / nav-gesture area sits along the same
  // bottom edge but insets.bottom can differ from portrait, and side insets
  // (insets.left/right) grow to clear the notch — padding the bar with the
  // real inset instead of a fixed height keeps icons from being clipped.
  const tabBarBottomPadding = Math.max(8, insets.bottom);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabel: TAB_LABELS[route.name as keyof MainTabParamList],
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceAlt,
          height: 52 + tabBarBottomPadding,
          paddingBottom: tabBarBottomPadding,
          paddingTop: 8,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, focused }) => (
          <TabIcon route={route.name as keyof MainTabParamList} color={color} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Projects" component={ProjectsScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="AIAssistant" component={AIAssistantScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};
