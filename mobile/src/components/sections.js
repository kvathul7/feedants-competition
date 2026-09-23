import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionTitle, IconBadge, PlayButton } from './primitives';
import { colors, spacing, radius, typography, cardStyle } from '../theme';
import { formatDate, formatTime, formatRupees } from '../utils/format';
import { useServerCountdown, formatCountdown } from '../hooks/useServerCountdown';

// ---------------------------------------------------------------- judge -----

export function JudgeCard({ judge, t }) {
  if (!judge) return null;
  return (
    <Card style={styles.judgeCard}>
      <Image source={{ uri: judge.photoUrl }} style={styles.judgeAvatar} />

      <View style={styles.judgeInfo}>
        <Text style={typography.label}>{t.judge}</Text>
        <Text style={styles.judgeName}>{judge.name}</Text>
        <Text style={typography.bodyMuted}>{judge.title}</Text>
        {judge.experienceYears ? (
          <Text style={typography.bodyMuted}>{t.yearsExperience(judge.experienceYears)}</Text>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={t.introVideo} style={styles.introVideo}>
        <PlayButton size={30} />
        <Text style={styles.introVideoText}>{t.introVideo}</Text>
      </Pressable>
    </Card>
  );
}

// ------------------------------------------------------------ countdown -----

/**
 * The deadline banner. Which deadline it tracks is decided server-side, so the
 * app does not re-derive the lifecycle; it renders whatever window the server
 * says is closing next.
 */
export function CountdownBanner({ countdown, serverTime, t, onExpire }) {
  const { parts, expired } = useServerCountdown(countdown?.targetAt, serverTime);
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (expired && !firedRef.current && countdown) {
      firedRef.current = true;
      // The deadline passed while the user was watching - refetch so the CTA
      // and the seat count reflect the new window instead of going stale.
      onExpire?.();
    }
  }, [expired, countdown, onExpire]);

  React.useEffect(() => {
    firedRef.current = false;
  }, [countdown?.targetAt]);

  if (!countdown) return null;

  return (
    <View style={styles.countdown}>
      <Ionicons name="hourglass-outline" size={20} color={colors.primary} />
      <Text style={styles.countdownLabel} numberOfLines={2}>
        {t.countdownLabels[countdown.key] || ''}
      </Text>
      <Text style={styles.countdownValue} numberOfLines={1}>
        {formatCountdown(parts)}
      </Text>

      {countdown.urgent ? (
        <View style={styles.hurry}>
          <Ionicons name="timer-outline" size={16} color={colors.primary} />
          <Text style={styles.hurryText}>{t.hurryUp}</Text>
        </View>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------- important dates ---

export function ImportantDates({ dates, locale, t }) {
  const cells = [
    { icon: 'calendar-outline', label: t.registerBefore, value: dates.registrationClosesAt },
    { icon: 'paper-plane-outline', label: t.submissionStarts, value: dates.submissionStartsAt },
    { icon: 'cloud-upload-outline', label: t.submissionEnds, value: dates.submissionEndsAt },
    { icon: 'trophy-outline', label: t.resultDate, value: dates.resultAt },
  ];

  return (
    <Card>
      <SectionTitle>{t.importantDates}</SectionTitle>

      {/* Bordered 2x2 with full cross dividers, as in the design - the rules
          run edge to edge rather than only between columns. */}
      <View style={styles.datesBox}>
        {cells.map((cell, i) => (
          <View
            key={cell.label}
            style={[
              styles.dateCell,
              i % 2 === 0 && styles.dateCellRule,   // vertical rule on left column
              i < 2 && styles.dateCellRuleBottom,   // horizontal rule under top row
            ]}
          >
            <Ionicons name={cell.icon} size={19} color={colors.primary} style={styles.dateIcon} />
            <View style={styles.dateText}>
              <Text style={typography.label}>{cell.label}</Text>
              <Text style={styles.dateValue}>{formatDate(cell.value, locale)}</Text>
              <Text style={typography.bodyMuted}>{formatTime(cell.value)}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

// -------------------------------------------------------- previous winners --

export function PreviousWinners({ winners, t }) {
  if (!winners?.length) return null;
  return (
    <Card style={{ paddingRight: 0 }}>
      <SectionTitle>{t.previousWinners}</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.winnerRow}
      >
        {winners.map((w, i) => (
          <View key={`${w.name}-${i}`} style={styles.winnerCard}>
            <View>
              <Image source={{ uri: w.thumbnailUrl }} style={styles.winnerThumb} />
              <PlayButton size={22} style={styles.winnerPlay} />
            </View>
            <View style={styles.winnerMeta}>
              <Text style={styles.winnerName} numberOfLines={1}>
                {w.name}
              </Text>
              <Text style={styles.winnerRank}>{t.winnerPosition(w.position)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

// ------------------------------------------------------------- tabs ---------

/**
 * About / Judging Parameters / Rules. Collapsed to three lines with a
 * View more toggle, as in the design.
 */
export function ContentTabs({ content, t }) {
  const [tab, setTab] = useState('about');
  const [expanded, setExpanded] = useState(false);

  const tabs = [
    { key: 'about', label: t.tabs.about },
    { key: 'judging', label: t.tabs.judging },
    { key: 'rules', label: t.tabs.rules },
  ];

  const body =
    tab === 'about'
      ? [content.about]
      : tab === 'judging'
        ? content.judgingParameters
        : content.rulesAndEligibility;

  const isList = tab !== 'about';
  const collapsible = isList ? body.length > 3 : content.about.length > 120;
  const visible = expanded || !collapsible ? body : isList ? body.slice(0, 3) : body;

  return (
    <Card>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = item.key === tab;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setTab(item.key);
                setExpanded(false);
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabBody}>
        {visible.map((line, i) =>
          isList ? (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={[typography.body, styles.bulletText]}>{line}</Text>
            </View>
          ) : (
            <Text
              key={i}
              style={[typography.body, styles.aboutText]}
              numberOfLines={expanded ? undefined : 3}
            >
              {line}
            </Text>
          )
        )}
      </View>

      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((v) => !v)}
          style={styles.viewMore}
        >
          <Text style={styles.viewMoreText}>{expanded ? t.viewLess : t.viewMore}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </Card>
  );
}

// ----------------------------------------------------------- rewards --------

const MEDALS = ['🏆', '🥈', '🥉'];

export function RewardsList({ rewards, t }) {
  if (!rewards?.length) return null;
  return (
    <Card>
      <SectionTitle right={t.allPositions}>{t.rewards}</SectionTitle>

      <View style={{ marginTop: spacing.md }}>
        {rewards.map((r, i) => (
          <View key={r.position} style={[styles.rewardRow, i % 2 === 1 && styles.rewardRowAlt]}>
            {MEDALS[i] ? (
              <Text style={styles.rewardIcon}>{MEDALS[i]}</Text>
            ) : (
              <Ionicons
                name="star-outline"
                size={15}
                color={colors.primary}
                style={styles.rewardIcon}
              />
            )}
            <Text style={styles.rewardLabel}>{r.label || t.winnerPosition(r.position)}</Text>
            <Text style={styles.rewardAmount}>₹ {formatRupees(r.amount)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ------------------------------------------------------- trust / info -------

export function DisclaimerStrip({ text, t }) {
  if (!text) return null;
  return (
    <View style={styles.disclaimer}>
      <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
      <Text style={styles.disclaimerText}>
        <Text style={styles.disclaimerLabel}>{t.disclaimer} </Text>
        {text}
      </Text>
    </View>
  );
}

export function TrustRow({ t }) {
  return (
    <View style={styles.trustRow}>
      <Card style={styles.trustCard}>
        <PlayButton size={36} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={typography.h3}>{t.prizeMoneyTitle}</Text>
          <Text style={styles.trustSub}>{t.prizeMoneySubtitle}</Text>
        </View>
      </Card>

      <View style={styles.trustSide}>
        <View style={styles.trustLine}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={typography.bodyMuted}>{t.refundPolicy}</Text>
        </View>
        <View style={styles.trustLine}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
          <Text style={[typography.bodyMuted, { flex: 1 }]} numberOfLines={2}>
            {t.securePayments} <Text style={styles.razorpay}>Razorpay</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------- referral --------

export function ReferralCard({ user, t, onCopy, copied }) {
  const link = user?.referralUrl || 'https://feedants.com/r/signin-to-get-yours';
  return (
    <View style={styles.referral}>
      <Ionicons name="megaphone-outline" size={22} color={colors.primary} style={styles.referralIcon} />

      {/*
        Two columns that must not collide. On react-native-web a flex child
        defaults to min-width:auto, so the link input refuses to shrink below
        its content and pushes the right column underneath. minWidth: 0 on both
        the column and the input is what actually lets them share the row.
      */}
      <View style={styles.referralLeft}>
        <Text style={typography.h3} numberOfLines={1}>
          {t.referTitle}
        </Text>

        <View style={styles.referralInputRow}>
          <TextInput value={link} editable={false} style={styles.referralInput} numberOfLines={1} />
          <Pressable accessibilityRole="button" onPress={onCopy} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>{copied ? t.copied : t.copyLink}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.referralRight}>
        <Pressable accessibilityRole="button" style={styles.referNowBtn}>
          <Text style={styles.referNowText}>{t.referNow}</Text>
        </Pressable>
        <Text style={styles.referEarn}>{t.referEarn(user?.referralRewardAmount ?? 10)}</Text>
      </View>
    </View>
  );
}

export function UsersTeaser({ t }) {
  return (
    <Card style={styles.teaser}>
      <IconBadge name="chatbubble-ellipses-outline" dim={36} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={typography.h3}>{t.hearFromUsers}</Text>
        <Text style={typography.bodyMuted}>{t.hearFromUsersSub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Card>
  );
}

export function AdSlot({ t }) {
  return (
    <View style={styles.ad}>
      <Ionicons name="megaphone-outline" size={16} color={colors.textFaint} />
      <Text style={styles.adText}>{t.adHere}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // judge
  judgeCard: { flexDirection: 'row', alignItems: 'center' },
  judgeAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.chip },
  judgeInfo: { flex: 1, marginLeft: spacing.md },
  judgeName: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 1 },
  introVideo: { alignItems: 'center', width: 62 },
  introVideoText: { ...typography.label, marginTop: 6, color: colors.textMuted },

  // countdown
  countdown: {
    ...cardStyle,
    backgroundColor: colors.primaryTint,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  countdownLabel: { ...typography.bodyMuted, fontSize: 11, flexShrink: 1 },
  countdownValue: { color: colors.primary, fontWeight: '700', fontSize: 13.5, flexGrow: 1, flexShrink: 0 },
  hurry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hurryText: { color: colors.primary, fontSize: 11, fontWeight: '600' },

  // dates
  datesBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  dateCell: { width: '50%', flexDirection: 'row', padding: 7 },
  dateCellRule: { borderRightWidth: 1, borderRightColor: colors.border },
  dateCellRuleBottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dateIcon: { marginTop: 2 },
  dateText: { marginLeft: spacing.md, flex: 1 },
  dateValue: { color: colors.primary, fontWeight: '700', fontSize: 12.5, marginTop: 1 },

  // winners
  winnerRow: { gap: spacing.sm, paddingRight: spacing.lg, marginTop: spacing.sm },
  winnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 6,
    paddingRight: spacing.lg,
    gap: spacing.md,
  },
  winnerThumb: { width: 42, height: 52, borderRadius: 8, backgroundColor: colors.chip },
  winnerPlay: { position: 'absolute', bottom: 5, left: 12 },
  winnerMeta: { maxWidth: 96 },
  winnerName: { fontWeight: '700', color: colors.text, fontSize: 12.5 },
  winnerRank: { color: colors.primary, fontSize: 11, marginTop: 1 },

  // tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { flex: 1, paddingBottom: spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 11.5, color: colors.textMuted },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  tabBody: { marginTop: spacing.md, gap: 6 },
  aboutText: { lineHeight: 17, color: colors.textMuted },
  bulletRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  bulletText: { flex: 1, color: colors.textMuted, lineHeight: 16 },
  viewMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.md },
  viewMoreText: { color: colors.primary, fontWeight: '700', fontSize: 12 },

  // rewards
  rewardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  rewardRowAlt: { backgroundColor: colors.primarySoft },
  rewardIcon: { fontSize: 15, width: 26 },
  rewardLabel: { flex: 1, fontWeight: '700', color: colors.text, fontSize: 12.5 },
  rewardAmount: { fontWeight: '700', color: colors.text, fontSize: 13 },

  // disclaimer
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primaryTint,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: colors.text, lineHeight: 16 },
  disclaimerLabel: { fontWeight: '700', color: colors.primary },

  // trust
  trustRow: { flexDirection: 'row', marginRight: spacing.md },
  trustCard: { flex: 1.1, flexDirection: 'row', alignItems: 'center' },
  trustSub: { ...typography.label, color: colors.accent, marginTop: 2 },
  trustSide: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingLeft: spacing.md, marginTop: spacing.md },
  trustLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  razorpay: { color: '#0C64C0', fontWeight: '700' },

  // referral
  referral: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5EF',
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: radius.lg,
    padding: 10,
    gap: spacing.sm,
  },
  referralIcon: { marginTop: 2 },
  // minWidth: 0 is load-bearing - without it the column cannot shrink and the
  // two halves of this card overlap.
  referralLeft: { flex: 1, minWidth: 0 },
  referralInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 5 },
  referralInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 10,
    color: colors.textMuted,
  },
  copyBtn: {
    flexShrink: 0,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  copyBtnText: { fontSize: 10, fontWeight: '700', color: colors.text },
  referralRight: { width: 112, flexShrink: 0 },
  referNowBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 8, alignItems: 'center' },
  referNowText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  referEarn: { ...typography.label, marginTop: 4, textAlign: 'center', fontSize: 10, lineHeight: 13 },

  // teaser + ad
  teaser: { flexDirection: 'row', alignItems: 'center' },
  ad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  adText: { ...typography.label, color: colors.textFaint },
});
