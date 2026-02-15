/** Color tokens for inline styles (SVG, reanimated, etc.) */
export const colors = {
  bg: '#f8f8f8',
  sidebarBg: '#f2f2f7',
  white: '#ffffff',
  black: '#000000',

  gray50: '#fafafa',
  gray100: '#f4f4f5',
  gray200: '#e4e4e7',
  gray300: '#d4d4d8',
  gray400: '#a1a1aa',
  gray500: '#71717a',
  gray600: '#52525b',
  gray700: '#3f3f46',
  gray800: '#27272a',
  gray900: '#18181b',
  gray950: '#09090b',

  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald50: '#ecfdf5',

  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber700: '#b45309',

  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red50: '#fef2f2',

  orange400: '#fb923c',
  orange500: '#f97316',
} as const;

export const shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 60,
    elevation: 8,
  },
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;
