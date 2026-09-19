/**
 * MproWave "Aurora" palette — a vivid violet-to-blue accent against deep
 * near-black (dark) or soft lavender-white (light), matching the app's
 * reference UI design.
 *
 * `onAccent` is white in this palette — the reference design consistently
 * sets white text/icons on the purple/blue accent surfaces (buttons, active
 * chips), unlike the previous warm-amber palette where dark ink read better.
 */
export const darkColors = {
  background: '#0B0A12',
  surface: '#15131E',
  surfaceAlt: '#1E1B2A',
  inputBackground: '#211D2E',
  border: '#2A2638',

  primary: '#7C5CFC',
  primaryLight: '#9B7BFF',
  primaryDark: '#5B3FD9',

  danger: '#F25767',
  accentTeal: '#3ED9C7',

  textPrimary: '#F5F3FA',
  textSecondary: '#9C97AE',
  textTertiary: '#6E6980',

  onAccent: '#FFFFFF',
};

export const lightColors: typeof darkColors = {
  background: '#F6F4FB',
  surface: '#FFFFFF',
  surfaceAlt: '#ECE8F7',
  inputBackground: '#F1EEFA',
  border: '#DED8ED',

  primary: '#6D46E0',
  primaryLight: '#7C5CFC',
  primaryDark: '#4F30B0',

  danger: '#D8394D',
  accentTeal: '#1FA898',

  textPrimary: '#1C1830',
  textSecondary: '#5C5670',
  textTertiary: '#8B84A0',

  onAccent: '#FFFFFF',
};

export type ThemeColors = typeof darkColors;

// Backward-compatible default: screens that haven't been made theme-aware
// (the fixed-brand auth screens, and anything reached only from them) keep
// importing this directly and always render in the dark "Aurora" look.
export const colors = darkColors;

// Diagonal near-black → indigo → violet spectrum, used behind the auth
// screens, which stay a fixed dark brand moment regardless of the user's
// theme setting (the same reasoning most apps use for a splash/auth screen).
export const heroGradient = ['#0B0A12', '#1B1030', '#3B1F6B', '#5B3FD9'] as const;

// The signature purple-to-blue accent gradient — the app logo's waveform
// icon, primary buttons, and active/highlighted surfaces throughout the
// reference design all use this same two-stop sweep.
export const primaryGradient = ['#7C5CFC', '#4F8CFF'] as const;

// Soft tints of the same spectrum, used for the floating-particle layer.
export const particleColors = ['#9B7BFF', '#4F8CFF', '#3ED9C7', '#F2A6E0'] as const;

/**
 * Distinct accent colors for the Home screen's Quick Actions grid — each
 * card needs to read as a different action at a glance, the same way the
 * reference design gives Generate Song/Upload Beat/Voice Memo/Create
 * Project each their own hue.
 */
export const quickActionColors = {
  generateSong: { icon: '#9B7BFF', tint: 'rgba(155, 123, 255, 0.16)' },
  uploadBeat: { icon: '#4F8CFF', tint: 'rgba(79, 140, 255, 0.16)' },
  voiceMemo: { icon: '#34D399', tint: 'rgba(52, 211, 153, 0.16)' },
  createProject: { icon: '#FB923C', tint: 'rgba(251, 146, 60, 0.16)' },
} as const;

// A small rotation of gradient pairs used as placeholder "cover art" for
// project cards — this app has no real generated artwork per project, so
// each project is assigned one of these deterministically (by id) instead
// of every card looking identical.
export const coverGradients = [
  ['#7C5CFC', '#4F8CFF'],
  ['#F2725A', '#F2A6E0'],
  ['#34D399', '#4F8CFF'],
  ['#FB923C', '#F2725A'],
  ['#4F8CFF', '#3ED9C7'],
] as const;

/**
 * Per-track-type accents, used consistently everywhere a track's type shows
 * up (type picker, editor badges, piano-roll notes) so the three kinds read
 * as distinct at a glance, the way color-coded tracks do in a real DAW.
 * Each accent is drawn from the existing palette rather than a new hue, and
 * stays constant across themes since these are small accent dots/badges,
 * not surfaces.
 */
export const trackTypeColors = {
  audio: {
    accent: darkColors.accentTeal,
    tint: 'rgba(79, 167, 154, 0.16)',
    border: 'rgba(79, 167, 154, 0.5)',
  },
  midi: {
    accent: darkColors.primaryLight,
    tint: 'rgba(217, 142, 74, 0.16)',
    border: 'rgba(242, 182, 115, 0.5)',
  },
  instrument: {
    accent: '#E39BD6',
    tint: 'rgba(227, 155, 214, 0.16)',
    border: 'rgba(227, 155, 214, 0.5)',
  },
} as const;

export type TrackTypeKey = keyof typeof trackTypeColors;
