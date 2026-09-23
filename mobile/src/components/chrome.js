import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './primitives';
import { colors, spacing, radius, typography } from '../theme';
import { paiseToRupees, formatRupees } from '../utils/format';

/** Back row plus the ENG / हिंदी switch. */
export function ScreenHeader({ locale, onToggleLocale, onBack, t }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.goBack} onPress={onBack} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
        <Text style={styles.backText}>{t.goBack}</Text>
      </Pressable>

      <View
        style={styles.localeSwitch}
        accessibilityRole="radiogroup"
        accessibilityLabel="Language"
      >
        {[
          { key: 'en', label: 'ENG' },
          { key: 'hi', label: 'हिंदी' },
        ].map((opt) => {
          const active = locale === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => !active && onToggleLocale()}
              style={[styles.localeOption, active && styles.localeOptionActive]}
            >
              <Text style={[styles.localeText, active && styles.localeTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The primary CTA.
 *
 * Intentionally dumb: which action applies, and whether it is enabled, is
 * decided by the server and arrives in `action`. The component only maps that
 * to copy and a handler, so a business-rule change does not require an app
 * release, and the button can never offer something the API would reject.
 */
export function BottomCta({ action, t, onPress, busy, disabledReasonVisible = true }) {
  if (!action) return null;

  const { action: kind, enabled, entryFeePaise } = action;

  const label =
    kind === 'register'
      ? t.cta.register(formatRupees(paiseToRupees(entryFeePaise)))
      : t.cta[kind] || t.cta.registration_closed;

  const sublabel = disabledReasonVisible ? t.ctaSub[kind] : undefined;

  return (
    <View style={styles.ctaBar}>
      <PrimaryButton
        label={label}
        sublabel={sublabel}
        onPress={onPress}
        disabled={!enabled}
        loading={busy}
      />
    </View>
  );
}

const NAV_ITEMS = [
  { key: 'home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'explore', icon: 'search-outline', activeIcon: 'search' },
  { key: 'create', icon: 'add', center: true },
  { key: 'competitions', icon: 'trophy-outline', activeIcon: 'trophy' },
  { key: 'profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

export function BottomNav({ active = 'competitions', avatarUrl, t }) {
  return (
    <View style={styles.nav}>
      {NAV_ITEMS.map((item) => {
        if (item.center) {
          return (
            <Pressable key={item.key} accessibilityRole="button" style={styles.navCenter}>
              <Ionicons name="add" size={26} color={colors.white} />
            </Pressable>
          );
        }

        const isActive = item.key === active;
        const isProfile = item.key === 'profile';

        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={styles.navItem}
          >
            {isProfile && avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.navAvatar} />
            ) : (
              <Ionicons
                name={isActive ? item.activeIcon : item.icon}
                size={22}
                color={isActive ? colors.primary : colors.textFaint}
              />
            )}
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {t.nav[item.key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backText: { fontSize: 16, fontWeight: '700', color: colors.text },

  localeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    padding: 3,
  },
  localeOption: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  localeOptionActive: { backgroundColor: colors.primary },
  localeText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  localeTextActive: { color: colors.white },

  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  navItem: { alignItems: 'center', gap: 2, flex: 1 },
  navLabel: { ...typography.label, fontSize: 11, color: colors.textFaint },
  navLabelActive: { color: colors.primary, fontWeight: '700' },
  navAvatar: { width: 24, height: 24, borderRadius: 12 },
  navCenter: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
