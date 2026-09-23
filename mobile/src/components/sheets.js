import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './primitives';
import { colors, spacing, radius, typography } from '../theme';
import { formatRupees, paiseToRupees } from '../utils/format';
import { useServerCountdown, formatCountdown } from '../hooks/useServerCountdown';

function Sheet({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Stands in for the Razorpay checkout sheet.
 *
 * It shows the live hold timer, because the seat is only reserved for a
 * limited window - the user needs to know their spot can lapse while they sit
 * here, and the CTA must stop working when it does.
 */
export function PaymentSheet({ visible, onClose, onConfirm, checkout, holdExpiresAt, serverTime, busy, t }) {
  const { parts, expired } = useServerCountdown(holdExpiresAt, serverTime);

  return (
    <Sheet visible={visible} onClose={busy ? undefined : onClose}>
      <View style={styles.payHeader}>
        <Ionicons name="lock-closed" size={18} color={colors.primary} />
        <Text style={typography.h2}>{t.payingTitle}</Text>
      </View>

      <Text style={[typography.bodyMuted, styles.payBody]}>{t.payingBody}</Text>

      {checkout ? (
        <View style={styles.payRow}>
          <Text style={typography.bodyMuted}>{checkout.orderId}</Text>
          <Text style={styles.payAmount}>₹ {formatRupees(paiseToRupees(checkout.amountPaise))}</Text>
        </View>
      ) : null}

      {holdExpiresAt ? (
        <View style={[styles.holdBanner, expired && styles.holdBannerExpired]}>
          <Ionicons
            name={expired ? 'alert-circle-outline' : 'time-outline'}
            size={16}
            color={expired ? colors.danger : colors.primary}
          />
          <Text style={[styles.holdText, expired && { color: colors.danger }]}>
            {expired ? 'Your seat hold expired' : `Seat held for ${formatCountdown(parts)}`}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton
          label={`${t.payNow} ₹ ${formatRupees(paiseToRupees(checkout?.amountPaise))}`}
          onPress={onConfirm}
          disabled={expired}
          loading={busy}
        />
      </View>

      <Pressable onPress={busy ? undefined : onClose} style={styles.cancel} accessibilityRole="button">
        <Text style={styles.cancelText}>{t.cancel}</Text>
      </Pressable>
    </Sheet>
  );
}

/** Upload / replace an entry. */
export function UploadSheet({ visible, onClose, onSubmit, busy, t, initialUrl = '' }) {
  const [url, setUrl] = useState(initialUrl);
  const [touched, setTouched] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setUrl(initialUrl);
      setTouched(false);
    }
  }, [visible, initialUrl]);

  const valid = /^https?:\/\/.+/i.test(url.trim());

  return (
    <Sheet visible={visible} onClose={busy ? undefined : onClose}>
      <Text style={typography.h2}>{t.uploadTitle}</Text>
      <Text style={[typography.bodyMuted, { marginTop: 4 }]}>{t.uploadHint}</Text>

      <TextInput
        value={url}
        onChangeText={setUrl}
        onBlur={() => setTouched(true)}
        placeholder="https://..."
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[styles.input, touched && !valid && styles.inputError]}
      />
      {touched && !valid ? <Text style={styles.errorText}>Enter a valid http(s) link</Text> : null}

      <View style={{ marginTop: spacing.lg }}>
        <PrimaryButton label={t.submit} onPress={() => onSubmit(url.trim())} disabled={!valid} loading={busy} />
      </View>

      <Pressable onPress={busy ? undefined : onClose} style={styles.cancel} accessibilityRole="button">
        <Text style={styles.cancelText}>{t.cancel}</Text>
      </Pressable>
    </Sheet>
  );
}

/** Non-blocking result banner shown at the top of the screen. */
export function Toast({ message, tone = 'info', onDismiss }) {
  if (!message) return null;
  return (
    <Pressable onPress={onDismiss} style={[styles.toast, tone === 'error' && styles.toastError]}>
      <Ionicons
        name={tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
        size={18}
        color={colors.white}
      />
      <Text style={styles.toastText}>{message}</Text>
    </Pressable>
  );
}

export function FullScreenLoader({ label }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={[typography.bodyMuted, { marginTop: spacing.md }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, t }) {
  return (
    <View style={styles.loader}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
      <Text style={[typography.h3, { marginTop: spacing.md }]}>{t.somethingWentWrong}</Text>
      <Text style={[typography.bodyMuted, styles.errorDetail]}>{error?.message}</Text>
      <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
        <Text style={styles.retryText}>{t.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,32,38,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },

  payHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  payBody: { marginTop: spacing.sm, lineHeight: 20 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  payAmount: { ...typography.h2, color: colors.primary },

  holdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  holdBannerExpired: { backgroundColor: '#FBEAE6' },
  holdText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.lg,
    fontSize: 14,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6 },

  cancel: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  cancelText: { color: colors.textMuted, fontWeight: '600' },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  toastError: { backgroundColor: colors.danger },
  toastText: { color: colors.white, flex: 1, fontSize: 13, fontWeight: '600' },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorDetail: { textAlign: 'center', marginTop: spacing.sm },
  retry: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryText: { color: colors.white, fontWeight: '700' },
});
