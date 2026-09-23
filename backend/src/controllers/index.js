import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Payment, PAYMENT_STATUS } from '../models/Payment.js';
import { Registration } from '../models/Registration.js';
import {
  getCompetitionDetails,
  listCompetitions,
  getWinners,
} from '../services/competitionService.js';
import {
  startRegistration,
  confirmRegistrationPayment,
  cancelRegistration,
} from '../services/registrationService.js';
import {
  upsertSubmission,
  getMySubmission,
  withdrawSubmission,
} from '../services/submissionService.js';
import { getPaymentProvider, isMockProvider } from '../services/paymentService.js';
import { reconcileCapacity } from '../services/seatService.js';

// ---------------------------------------------------------------- auth ------

/**
 * Development sign-in. Issues a token for a seeded user by email.
 *
 * This stands in for the real identity provider. Everything downstream depends
 * only on `req.user`, so replacing this one handler with an OTP or OAuth flow
 * changes nothing else in the codebase.
 */
export async function devLogin(req, res) {
  if (env.nodeEnv === 'production') {
    throw ApiError.forbidden('DEV_LOGIN_DISABLED', 'Development login is disabled in production');
  }
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user) {
    throw ApiError.notFound('USER_NOT_FOUND', 'No seeded user with that email - run `npm run seed`');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  avatarUrl: user.avatarUrl,
  locale: user.locale,
  referralCode: user.referralCode,
  referralUrl: `https://feedants.com/r/${user.referralCode}`,
  referralRewardAmount: env.referralRewardAmount,
  referralEarnings: user.referralEarningsPaise / 100,
});

// --------------------------------------------------------- competitions -----

export async function getDetails(req, res) {
  const payload = await getCompetitionDetails({
    idOrSlug: req.params.id,
    userId: req.user?._id || null,
    locale: req.locale,
  });
  // The screen is user-specific and time-sensitive; never let a proxy cache it.
  res.set('Cache-Control', 'private, no-store');
  res.json(payload);
}

export async function getList(req, res) {
  res.json(await listCompetitions({ locale: req.locale, cursor: req.query.cursor }));
}

export async function getCompetitionWinners(req, res) {
  res.json({ winners: await getWinners({ competitionId: req.params.id }) });
}

// --------------------------------------------------------- registration -----

export async function postRegistration(req, res) {
  const result = await startRegistration({
    userId: req.user._id,
    competitionId: req.params.id,
    idempotencyKey: req.body.idempotencyKey || req.get('Idempotency-Key'),
  });

  res.status(result.resumed ? 200 : 201).json({
    resumed: result.resumed,
    registration: {
      id: result.registration._id,
      status: result.registration.status,
      holdExpiresAt: result.registration.holdExpiresAt,
    },
    checkout: result.checkout,
    // Test-only: lets the app complete a payment without a live gateway.
    ...(isMockProvider() && result.payment ? { mockPayment: buildMockHelper(result.payment) } : {}),
    serverTime: new Date(),
  });
}

/**
 * With the mock provider the client cannot produce a valid signature on its
 * own, so the server hands back the values a real checkout SDK would return.
 * Gated on the provider so this can never leak in a Razorpay deployment.
 */
function buildMockHelper(payment) {
  const provider = getPaymentProvider();
  const providerPaymentId = `pay_mock_${crypto.randomBytes(8).toString('hex')}`;
  return {
    note: 'Mock gateway. POST these to /payments/confirm to simulate a successful payment.',
    orderId: payment.providerOrderId,
    paymentId: providerPaymentId,
    signature: provider.__signForTesting({
      providerOrderId: payment.providerOrderId,
      providerPaymentId,
    }),
  };
}

export async function postConfirmPayment(req, res) {
  const result = await confirmRegistrationPayment({
    userId: req.user._id,
    providerOrderId: req.body.orderId,
    providerPaymentId: req.body.paymentId,
    signature: req.body.signature,
  });

  res.json({
    alreadyProcessed: result.alreadyProcessed,
    lateReclaim: Boolean(result.lateReclaim),
    registration: {
      id: result.registration._id,
      status: result.registration.status,
      confirmedAt: result.registration.confirmedAt,
    },
    serverTime: new Date(),
  });
}

export async function deleteRegistration(req, res) {
  const registration = await cancelRegistration({
    userId: req.user._id,
    competitionId: req.params.id,
  });
  res.json({ registration: { id: registration._id, status: registration.status } });
}

// ---------------------------------------------------------- submissions -----

export async function putSubmission(req, res) {
  const { submission, replaced } = await upsertSubmission({
    userId: req.user._id,
    competitionId: req.params.id,
    mediaUrl: req.body.mediaUrl,
    caption: req.body.caption,
  });

  res.status(replaced ? 200 : 201).json({
    replaced,
    submission: {
      id: submission._id,
      mediaUrl: submission.mediaUrl,
      caption: submission.caption,
      revision: submission.revision,
      submittedAt: submission.submittedAt,
      status: submission.status,
    },
  });
}

export async function getSubmission(req, res) {
  const submission = await getMySubmission({ userId: req.user._id, competitionId: req.params.id });
  res.json({ submission });
}

export async function deleteSubmission(req, res) {
  res.json(await withdrawSubmission({ userId: req.user._id, competitionId: req.params.id }));
}

// ------------------------------------------------------------- webhooks -----

/**
 * Provider webhook. This is the authoritative confirmation path: the client
 * callback can be lost (app killed mid-payment, network dropped), so the
 * gateway calling us is what actually guarantees a paid user gets their seat.
 *
 * Signed over the raw body, and idempotent on the provider event id, because
 * webhook delivery is at-least-once.
 */
export async function postPaymentWebhook(req, res) {
  const signature = req.get('x-razorpay-signature') || req.get('x-webhook-signature');
  const provider = getPaymentProvider();

  if (!signature || !provider.verifyWebhookSignature({ rawBody: req.rawBody, signature })) {
    throw ApiError.unauthorized('INVALID_WEBHOOK_SIGNATURE', 'Webhook signature verification failed');
  }

  const event = req.body;
  const eventId = event.id || event.event_id;
  const entity = event?.payload?.payment?.entity || {};

  const payment = await Payment.findOne({ providerOrderId: entity.order_id });
  if (!payment) {
    // Unknown order: acknowledge so the provider stops retrying a lost cause.
    return res.json({ received: true, applied: false, reason: 'UNKNOWN_ORDER' });
  }

  if (eventId && payment.processedEventIds.includes(eventId)) {
    return res.json({ received: true, applied: false, reason: 'DUPLICATE_EVENT' });
  }

  if (event.event === 'payment.captured' && payment.status !== PAYMENT_STATUS.PAID) {
    await confirmRegistrationPayment({
      userId: payment.user,
      providerOrderId: entity.order_id,
      providerPaymentId: entity.id,
      signature: entity.signature,
    }).catch((err) => {
      // A refund decision is a valid terminal outcome, not a webhook failure.
      if (err.code !== 'SEAT_LOST_REFUND_INITIATED') throw err;
    });
  } else if (event.event === 'payment.failed') {
    await Payment.updateOne(
      { _id: payment._id, status: PAYMENT_STATUS.CREATED },
      { $set: { status: PAYMENT_STATUS.FAILED, failureReason: entity.error_description || 'GATEWAY_FAILURE' } }
    );
  }

  if (eventId) {
    await Payment.updateOne({ _id: payment._id }, { $addToSet: { processedEventIds: eventId } });
  }

  res.json({ received: true, applied: true });
}

// ------------------------------------------------------------ ops/debug -----

/** Operational endpoint: verify the seat counter against the source of truth. */
export async function getCapacityAudit(req, res) {
  const result = await reconcileCapacity(req.params.id);
  if (!result) throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');
  res.json(result);
}

export async function getMyRegistrations(req, res) {
  const registrations = await Registration.find({ user: req.user._id })
    .populate('competition', 'title slug dates entryFeePaise')
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ registrations });
}
