import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ProgressBar } from './primitives';
import { colors, spacing, typography } from '../theme';
import { formatRupees } from '../utils/format';

/**
 * Title block: tags, prize pool, entry fee and live capacity.
 *
 * Capacity comes straight from the server on every read - it is the one number
 * on this screen most likely to be stale, because other users move it.
 */
export function HeroCard({ competition, capacity, isRegistered, t }) {
  const spotsLeft = capacity.spotsLeft;

  return (
    <Card>
      <View style={styles.titleRow}>
        <Text style={[typography.h1, styles.title]} numberOfLines={2}>
          {competition.title}
        </Text>

        {isRegistered ? (
          <View style={styles.registeredPill}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.registeredText}>{t.registered}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.tagRow}>
        {competition.tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}

        {competition.certificateOnWin ? (
          <View style={styles.certificate}>
            <Ionicons name="trophy-outline" size={16} color={colors.primary} />
            <Text style={styles.certificateText}>{t.winnersGetCertificate}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={typography.label}>{t.prizePool}</Text>
          <Text style={typography.money}>₹ {formatRupees(competition.prizePool.amount)}</Text>
        </View>

        <View style={styles.stat}>
          <Text style={typography.label}>{t.entryFee}</Text>
          <Text style={typography.money}>
            {competition.entryFee.amount === 0 ? 'Free' : `₹ ${formatRupees(competition.entryFee.amount)}`}
          </Text>
        </View>

        <View style={styles.capacity}>
          <View style={styles.capacityLabel}>
            <Ionicons name="people-outline" size={16} color={colors.primary} />
            <Text style={styles.capacityText} numberOfLines={1}>
              {capacity.soldOut ? t.soldOut : t.spotsLeft(spotsLeft)}
            </Text>
          </View>
          <ProgressBar percent={capacity.percentBooked} />
          <Text style={styles.bookedText}>{t.booked(capacity.booked, capacity.total)}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },

  registeredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryTint,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 10,
  },
  registeredText: { color: colors.primary, fontWeight: '700', fontSize: 12 },

  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  certificate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  certificateText: { color: colors.primary, fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: spacing.sm },
  stat: { minWidth: 72 },

  capacity: { flex: 1, marginLeft: spacing.sm },
  capacityLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  capacityText: { color: colors.primary, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  bookedText: { ...typography.label, marginTop: 6 },
});
