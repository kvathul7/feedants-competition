/**
 * Design tokens lifted from the reference screen. Components never hardcode a
 * hex value or a magic spacing number - every visual constant lives here, so
 * the palette can be retuned in one place.
 */
export const colors = {
  primary: '#00696E',
  primaryDeep: '#0B5F63',
  primaryTint: '#E8F3F2',
  primarySoft: '#F1F8F7',

  text: '#12303A',
  textMuted: '#7A8C93',
  textFaint: '#9BAAB1',

  bg: '#F2F5F6',
  card: '#FFFFFF',
  border: '#E7EDEF',
  divider: '#EFF3F4',

  success: '#0E8F6F',
  successTint: '#E3F3EF',
  danger: '#C2492F',
  warning: '#B8791F',

  chip: '#F1F4F5',
  track: '#DDE7E8',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 16, fontWeight: '700', color: colors.text },
  h3: { fontSize: 14, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.text },
  bodyMuted: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 12, color: colors.textMuted },
  money: { fontSize: 22, fontWeight: '700', color: colors.primary },
};

/** Consistent card surface used by every section of the screen. */
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  padding: spacing.lg,
  marginHorizontal: spacing.md,
  marginTop: spacing.md,
  borderWidth: 1,
  borderColor: colors.border,
};
