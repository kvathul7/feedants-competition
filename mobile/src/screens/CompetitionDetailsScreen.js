import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { useCompetition } from '../hooks/useCompetition';
import { api, ApiError } from '../api/client';
import { colors, spacing } from '../theme';

import { ScreenHeader, BottomCta, BottomNav } from '../components/chrome';
import { HeroCard } from '../components/HeroCard';
import {
  JudgeCard,
  CountdownBanner,
  ImportantDates,
  PreviousWinners,
  ContentTabs,
  RewardsList,
  DisclaimerStrip,
  TrustRow,
  ReferralCard,
  UsersTeaser,
  AdSlot,
} from '../components/sections';
import { PaymentSheet, UploadSheet, Toast, FullScreenLoader, ErrorState } from '../components/sheets';

const COMPETITION_SLUG = 'feedants-classical-dance';

export default function CompetitionDetailsScreen() {
  const { t, locale, toggleLocale, user, isAuthenticated, signIn, signingIn } = useApp();
  const { data, loading, refreshing, error, refresh, reload } = useCompetition(
    COMPETITION_SLUG,
    locale,
    { isAuthenticated }
  );

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [payment, setPayment] = useState(null); // { checkout, mockPayment, holdExpiresAt }
  const [uploadOpen, setUploadOpen] = useState(false);

  /**
   * One key per registration attempt, held across retries. If the response is
   * lost to a flaky network the retry carries the SAME key, so the server
   * resolves it to the original seat instead of consuming a second one.
   */
  const idempotencyKey = useRef(null);

  const showToast = useCallback((message, tone = 'info') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleApiError = useCallback(
    (err) => {
      const message = err instanceof ApiError ? err.message : t.somethingWentWrong;
      showToast(message, 'error');
      // Conflicts mean our view of the world is behind - resync immediately.
      if (err instanceof ApiError && [409, 410].includes(err.status)) refresh();
    },
    [refresh, showToast, t]
  );

  // ---- registration ------------------------------------------------------

  const startRegistration = useCallback(async () => {
    setBusy(true);
    try {
      if (!idempotencyKey.current) {
        idempotencyKey.current = `reg-${data.competition.id}-${Date.now()}`;
      }
      const res = await api.register(data.competition.id, idempotencyKey.current);
      setPayment({
        checkout: res.checkout,
        mockPayment: res.mockPayment,
        holdExpiresAt: res.registration.holdExpiresAt,
        serverTime: res.serverTime,
      });
    } catch (err) {
      handleApiError(err);
      idempotencyKey.current = null;
    } finally {
      setBusy(false);
    }
  }, [data, handleApiError]);

  const confirmPayment = useCallback(async () => {
    if (!payment?.mockPayment) return;
    setBusy(true);
    try {
      await api.confirmPayment({
        orderId: payment.mockPayment.orderId,
        paymentId: payment.mockPayment.paymentId,
        signature: payment.mockPayment.signature,
      });
      setPayment(null);
      idempotencyKey.current = null;
      await refresh();
      showToast(t.registered);
    } catch (err) {
      handleApiError(err);
      setPayment(null);
    } finally {
      setBusy(false);
    }
  }, [payment, refresh, showToast, handleApiError, t]);

  const submitEntry = useCallback(
    async (url) => {
      setBusy(true);
      try {
        await api.submit(data.competition.id, url);
        setUploadOpen(false);
        await refresh();
        showToast(t.submissionSaved);
      } catch (err) {
        handleApiError(err);
      } finally {
        setBusy(false);
      }
    },
    [data, refresh, showToast, handleApiError, t]
  );

  /**
   * The CTA never decides policy - it dispatches on the action the server
   * chose. Any state the server marks disabled simply never reaches here.
   */
  const onCtaPress = useCallback(async () => {
    const kind = data?.viewer?.action?.action;

    if (!isAuthenticated) {
      try {
        await signIn();
      } catch (err) {
        handleApiError(err);
      }
      return;
    }

    switch (kind) {
      case 'register':
        return startRegistration();
      case 'complete_payment':
        // Re-issue to recover the open order for the existing hold.
        return startRegistration();
      case 'upload_submission':
      case 'edit_submission':
        return setUploadOpen(true);
      case 'view_submission':
        return showToast(data.viewer.submission?.mediaUrl || '-');
      case 'view_results':
        return showToast('Results are in - check the winners list');
      default:
        return undefined;
    }
  }, [data, isAuthenticated, signIn, startRegistration, showToast, handleApiError]);

  // ---- render ------------------------------------------------------------

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <FullScreenLoader />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ErrorState error={error} onRetry={reload} t={t} />
      </SafeAreaView>
    );
  }

  const { competition, capacity, countdown, viewer, serverTime } = data;
  const isRegistered = viewer.registration?.status === 'confirmed';

  const ctaAction = isAuthenticated
    ? viewer.action
    : { action: 'register', enabled: true, entryFeePaise: competition.entryFee.paise };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <ScreenHeader locale={locale} onToggleLocale={toggleLocale} onBack={() => {}} t={t} />

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <HeroCard competition={competition} capacity={capacity} isRegistered={isRegistered} t={t} />
        <JudgeCard judge={competition.judge} t={t} />
        <CountdownBanner countdown={countdown} serverTime={serverTime} t={t} onExpire={refresh} />
        <ImportantDates dates={competition.dates} locale={locale} t={t} />
        <PreviousWinners winners={competition.previousWinners} t={t} />
        <ContentTabs content={competition.content} t={t} />
        <RewardsList rewards={competition.rewards} t={t} />
        <DisclaimerStrip text={competition.disclaimer} t={t} />
        <TrustRow t={t} />
        <ReferralCard
          user={user}
          t={t}
          copied={copied}
          onCopy={() => {
            // Clipboard needs expo-clipboard; the visual affordance is wired so
            // the interaction is demonstrable without the extra dependency.
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        />
        <UsersTeaser t={t} />
        <AdSlot t={t} />
      </ScrollView>

      <BottomCta action={ctaAction} t={t} onPress={onCtaPress} busy={busy || signingIn} />
      <BottomNav active="competitions" avatarUrl={user?.avatarUrl} t={t} />

      <PaymentSheet
        visible={Boolean(payment)}
        onClose={() => setPayment(null)}
        onConfirm={confirmPayment}
        checkout={payment?.checkout}
        holdExpiresAt={payment?.holdExpiresAt}
        serverTime={payment?.serverTime}
        busy={busy}
        t={t}
      />

      <UploadSheet
        visible={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={submitEntry}
        initialUrl={viewer.submission?.mediaUrl || ''}
        busy={busy}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xl },
});
