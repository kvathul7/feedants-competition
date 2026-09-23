import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography, cardStyle } from '../theme';

/** Standard white surface every section sits on. */
export const Card = ({ style, children, ...rest }) => (
  <View style={[cardStyle, style]} {...rest}>
    {children}
  </View>
);

export const SectionTitle = ({ children, right }) => (
  <View style={styles.sectionTitleRow}>
    <Text style={typography.h2}>{children}</Text>
    {right ? <Text style={styles.sectionTitleRight}>{right}</Text> : null}
  </View>
);

export const Chip = ({ label, tone = 'neutral' }) => (
  <View style={[styles.chip, tone === 'success' && styles.chipSuccess]}>
    <Text style={[styles.chipText, tone === 'success' && styles.chipTextSuccess]}>{label}</Text>
  </View>
);

/** Circular tinted icon badge used across the dates grid and info rows. */
export const IconBadge = ({ name, size = 18, color = colors.primary, bg = colors.primaryTint, dim = 34 }) => (
  <View style={[styles.iconBadge, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg }]}>
    <Ionicons name={name} size={size} color={color} />
  </View>
);

export const Divider = ({ vertical = false, style }) => (
  <View style={[vertical ? styles.dividerV : styles.dividerH, style]} />
);

/**
 * Capacity bar. Always renders at least a sliver of fill so a competition with
 * one booking still reads as "started" rather than empty, and clamps at 100%
 * so a drifted counter can never overflow the track.
 */
export const ProgressBar = ({ percent }) => {
  const clamped = Math.max(3, Math.min(100, Number(percent) || 0));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
};

/** Circular play affordance layered over winner thumbnails and video tiles. */
export const PlayButton = ({ size = 28, style }) => (
  <View style={[styles.play, { width: size, height: size, borderRadius: size / 2 }, style]}>
    <Ionicons name="play" size={size * 0.5} color={colors.white} style={{ marginLeft: 1 }} />
  </View>
);

export const PrimaryButton = ({ label, sublabel, onPress, disabled, loading, tone = 'primary' }) => {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive) }}
      accessibilityLabel={label}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        tone === 'muted' && styles.primaryBtnMuted,
        inactive && styles.primaryBtnDisabled,
        pressed && !inactive && styles.primaryBtnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <>
          <Text style={styles.primaryBtnText}>{label}</Text>
          {sublabel ? <Text style={styles.primaryBtnSub}>{sublabel}</Text> : null}
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitleRight: { ...typography.label, marginTop: 2 },

  chip: {
    backgroundColor: colors.chip,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipSuccess: { backgroundColor: colors.successTint, flexDirection: 'row', alignItems: 'center' },
  chipText: { fontSize: 11, color: colors.text, fontWeight: '500' },
  chipTextSuccess: { color: colors.success, fontWeight: '600' },

  iconBadge: { alignItems: 'center', justifyContent: 'center' },

  dividerH: { height: 1, backgroundColor: colors.divider, width: '100%' },
  dividerV: { width: 1, backgroundColor: colors.divider, alignSelf: 'stretch' },

  track: { height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },

  play: {
    backgroundColor: 'rgba(0,105,110,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnMuted: { backgroundColor: colors.textFaint },
  primaryBtnDisabled: { backgroundColor: '#B6C4C7' },
  primaryBtnPressed: { backgroundColor: colors.primaryDeep },
  primaryBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  primaryBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },
});
