import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors, primaryGradient } from '../theme/colors';
import { BackButton } from '../components/BackButton';

interface Plan {
  key: 'free' | 'pro' | 'studio';
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  current?: boolean;
  highlight?: boolean;
}

// There's no payment processor wired up yet — these are the real plan
// tiers and feature lists, but "Upgrade" is honest about not being able to
// actually charge anyone rather than faking a purchase flow.
const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'Everything you need to start producing',
    current: true,
    features: [
      'Unlimited projects & tracks',
      'AI lyrics, MIDI & drum generation',
      'Voice memos & per-project chat',
      'Follow producers & comment on shared beats',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: '/month',
    tagline: 'For producers who create every week',
    highlight: true,
    features: [
      'Everything in Free',
      'Priority stem separation (faster queue)',
      'AI song generation with real vocals & beat',
      'Higher-quality audio exports',
      'No ads',
    ],
  },
  {
    key: 'studio',
    name: 'Studio',
    price: '$24.99',
    period: '/month',
    tagline: 'For serious studios & collaborators',
    features: [
      'Everything in Pro',
      'Expanded cloud storage',
      'Unlimited AI generations, no daily caps',
      'Early access to new AI features',
    ],
  },
];

export const SubscriptionScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const handleChoose = (plan: Plan) => {
    if (plan.current) return;
    Alert.alert(
      'Payments not set up yet',
      `${plan.name} looks great, but this app isn't connected to a payment processor yet, so upgrading isn't possible right now. Check back soon.`
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <Text style={styles.intro}>Choose the plan that fits how you make music.</Text>

        {PLANS.map((plan) =>
          plan.highlight ? (
            <LinearGradient
              key={plan.key}
              colors={primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.planCardHighlight}
            >
              {renderPlanBody(plan, styles, colors, true, handleChoose)}
            </LinearGradient>
          ) : (
            <View key={plan.key} style={[styles.planCard, plan.current && styles.planCardCurrent]}>
              {renderPlanBody(plan, styles, colors, false, handleChoose)}
            </View>
          )
        )}

        <Text style={styles.footnote}>
          Prices shown are illustrative — no payment processor is connected yet, so nothing will be charged.
        </Text>
      </ScrollView>
    </View>
  );
};

function renderPlanBody(
  plan: Plan,
  styles: ReturnType<typeof getStyles>,
  colors: ThemeColors,
  onGradient: boolean,
  onChoose: (plan: Plan) => void
) {
  const textColor = onGradient ? '#FFFFFF' : colors.textPrimary;
  const subColor = onGradient ? 'rgba(255,255,255,0.85)' : colors.textTertiary;
  const checkColor = onGradient ? '#FFFFFF' : colors.primaryLight;

  return (
    <>
      <View style={styles.planHeaderRow}>
        <View>
          <Text style={[styles.planName, { color: textColor }]}>{plan.name}</Text>
          <Text style={[styles.planTagline, { color: subColor }]}>{plan.tagline}</Text>
        </View>
        {plan.current && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current</Text>
          </View>
        )}
      </View>

      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: textColor }]}>{plan.price}</Text>
        {plan.period && <Text style={[styles.pricePeriod, { color: subColor }]}>{plan.period}</Text>}
      </View>

      <View style={styles.featureList}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color={checkColor} />
            <Text style={[styles.featureText, { color: onGradient ? '#FFFFFF' : colors.textSecondary }]}>
              {feature}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.chooseButton,
          plan.current
            ? { backgroundColor: onGradient ? 'rgba(255,255,255,0.2)' : colors.surfaceAlt }
            : { backgroundColor: onGradient ? '#FFFFFF' : colors.primary },
        ]}
        onPress={() => onChoose(plan)}
        disabled={plan.current}
      >
        <Text
          style={[
            styles.chooseButtonText,
            { color: plan.current ? (onGradient ? '#FFFFFF' : colors.textSecondary) : onGradient ? colors.primary : colors.onAccent },
          ]}
        >
          {plan.current ? 'Your current plan' : `Upgrade to ${plan.name}`}
        </Text>
      </TouchableOpacity>
    </>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    intro: {
      fontSize: 13.5,
      color: colors.textSecondary,
      marginBottom: 18,
      textAlign: 'center',
    },
    planCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    planCardCurrent: {
      borderColor: colors.border,
    },
    planCardHighlight: {
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
    },
    planHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    planName: {
      fontSize: 19,
      fontWeight: '700',
    },
    planTagline: {
      fontSize: 12,
      marginTop: 3,
      maxWidth: 220,
    },
    currentBadge: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    currentBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      marginBottom: 16,
    },
    price: {
      fontSize: 30,
      fontWeight: '800',
    },
    pricePeriod: {
      fontSize: 13,
      marginBottom: 5,
    },
    featureList: {
      gap: 10,
      marginBottom: 20,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    featureText: {
      fontSize: 13,
      flex: 1,
    },
    chooseButton: {
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
    },
    chooseButtonText: {
      fontSize: 14,
      fontWeight: '700',
    },
    footnote: {
      fontSize: 11.5,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 6,
      paddingHorizontal: 10,
    },
  });
