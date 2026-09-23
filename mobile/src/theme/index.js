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

  // Soft violet used for the 'Watch video to know more' subtitle.
  accent: '#8B84D7',

  success: '#0E8F6F',
  successTint: '#E3F3EF',
  danger: '#C2492F',
  warning: '#B8791F',

  chip: '#F1F4F5',
  track: '#DDE7E8',
  white: '#FFFFFF',
};

/**
 * Tightened to match the reference density. The design fits all fifteen
 * sections into roughly 920pt of scroll at a 426pt width; a conventional
 * 8/12/16 scale overshot that by ~60%.
 */
export const spacing = {
  xs: 3,
  sm: 6,
  md: 9,
  lg: 12,
  xl: 15,
  xxl: 20,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

/**
 * Calibrated against the reference at a 430pt viewport. The first pass ran
 * ~1.5x large, which pushed the hero card to nearly double its height and made
 * the countdown row wrap - the design fits all fifteen sections in roughly the
 * vertical space this ramp now produces.
 */
export const typography = {
  h1: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: colors.text },
  h2: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  h3: { fontSize: 13, fontWeight: '700', color: colors.text },
  body: { fontSize: 12.5, lineHeight: 16, color: colors.text },
  bodyMuted: { fontSize: 11.5, lineHeight: 15, color: colors.textMuted },
  label: { fontSize: 11, lineHeight: 14, color: colors.textMuted },
  money: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: colors.primary },
};

/** Consistent card surface used by every section of the screen. */
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  padding: 10,
  marginHorizontal: 16,
  marginTop: 6,
  borderWidth: 1,
  borderColor: colors.border,
};
