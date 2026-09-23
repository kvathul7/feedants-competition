import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { Competition } from '../models/Competition.js';
import { Registration, REGISTRATION_STATUS } from '../models/Registration.js';
import { Payment, PAYMENT_STATUS } from '../models/Payment.js';
import { canRegister } from './lifecycleService.js';
import { claimSeat, releaseSeat, sweepExpiredHolds } from './seatService.js';
import { getPaymentProvider } from './paymentService.js';

async function loadPublishedCompetition(competitionId) {
  const competition = await Competition.findById(competitionId);
  if (!competition || competition.status === 'draft') {
    throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');
  }
  return competition;
}

/**
 * Step 1 of registration: reserve a seat and open a payment order.
 *
 * Idempotent on `idempotencyKey`: a double-tapped Register button, or a client
 * retry after a dropped response, resolves to the same seat and the same order
 * rather than consuming two seats.
 */
export async function startRegistration({ userId, competitionId, idempotencyKey }) {
  const competition = await loadPublishedCompetition(competitionId);
  const now = new Date();

  const gate = canRegister({ competition, now });
  if (!gate.ok) {
    const status = gate.code === 'REGISTRATION_CLOSED' ? 410 : 409;
    throw new ApiError(status, gate.code, `Cannot register: ${gate.code}`);
  }

  const existing = await Registration.findOne({ competition: competitionId, user: userId });

  if (existing?.status === REGISTRATION_STATUS.CONFIRMED) {
    throw ApiError.conflict('ALREADY_REGISTERED', 'You are already registered for this competition');
  }

  // Live hold: resume the in-flight attempt instead of taking a second seat.
  if (existing?.isActiveHold(now)) {
    const pending = await Payment.findOne({
      registration: existing._id,
      status: PAYMENT_STATUS.CREATED,
    });
    if (pending) {
      return {
        resumed: true,
        registration: existing,
        payment: pending,
        checkout: buildCheckoutPayload(competition, pending),
      };
    }
    // Hold with no open order (crash between the two writes): release and redo.
    await expireHold(existing);
  }

  // Free competitions skip the payment leg entirely.
  const isFree = competition.entryFeePaise === 0;

  const { registration, competitionAfter } = await reserveSeatForUser({
    competition,
    userId,
    now,
    confirmImmediately: isFree,
  });

  if (isFree) {
    return {
      resumed: false,
      registration,
      payment: null,
      checkout: null,
      competition: competitionAfter,
    };
  }

  // Provider I/O happens only after the seat is secured, and never while
  // holding a lock: an external call of unbounded latency must not sit in the
  // critical path of the capacity counter.
  let payment;
  try {
    payment = await openPaymentOrder({ competition, userId, registration, idempotencyKey });
  } catch (err) {
    // Compensate: the seat must not stay held for an order that never opened.
    await expireHold(registration);
    throw err;
  }

  return {
    resumed: false,
    registration,
    payment,
    checkout: buildCheckoutPayload(competition, payment),
    competition: competitionAfter,
  };
}

/** Statuses from which a user may start a fresh registration attempt. */
const RELEASABLE = [
  REGISTRATION_STATUS.EXPIRED,
  REGISTRATION_STATUS.CANCELLED,
  REGISTRATION_STATUS.REFUNDED,
];

/**
 * Wins the right to occupy a seat for this (competition, user) pair.
 *
 * This must happen BEFORE any seat is claimed. Claiming first and deduplicating
 * afterwards is subtly broken: the unique index collapses N racing requests
 * into one registration document, but N seats have already been taken off the
 * counter, and one user double-tapping Register silently consumes the whole
 * competition.
 *
 * The upsert is the serialisation point. Exactly one concurrent caller can
 * transition the document into a seat-occupying state; the rest collide on the
 * unique index (E11000) and are told to resume the winner's attempt instead.
 */
async function acquireRegistrationSlot({ competitionId, userId, now, confirmImmediately }) {
  const update = confirmImmediately
    ? {
        status: REGISTRATION_STATUS.CONFIRMED,
        holdExpiresAt: null,
        confirmedAt: now,
        amountPaidPaise: 0,
      }
    : {
        status: REGISTRATION_STATUS.HELD,
        holdExpiresAt: new Date(now.getTime() + env.seatHoldSeconds * 1000),
        confirmedAt: null,
      };

  // Matches only a registration that is not currently occupying a seat: either
  // one of the releasable terminal states, or a hold that has already lapsed.
  const filter = {
    competition: competitionId,
    user: userId,
    $or: [
      { status: { $in: RELEASABLE } },
      { status: REGISTRATION_STATUS.HELD, holdExpiresAt: { $lte: now } },
    ],
  };

  try {
    const registration = await Registration.findOneAndUpdate(
      filter,
      {
        $set: { ...update, seatClaimed: false },
        $inc: { revision: 1 },
        $setOnInsert: { competition: competitionId, user: userId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { registration, won: true };
  } catch (err) {
    if (err?.code === 11000) {
      // Someone else (possibly this same user, milliseconds earlier) already
      // holds the slot.
      return { registration: await Registration.findOne({ competition: competitionId, user: userId }), won: false };
    }
    throw err;
  }
}

/**
 * Acquires the slot, then claims the seat, rolling the slot back if the
 * competition turns out to be full.
 *
 * Deliberately NOT wrapped in a transaction. Every capacity write already
 * targets a single document atomically, and `seatClaimed` makes the two-step
 * sequence recoverable. Holding a transaction across the capacity counter -
 * the hottest document in the system - would turn seat contention into a
 * storm of write conflicts and retries, which is the opposite of what a
 * "thousands of concurrent users" requirement needs.
 */
async function reserveSeatForUser({ competition, userId, now, confirmImmediately }) {
  const competitionId = competition._id;

  const { registration, won } = await acquireRegistrationSlot({
    competitionId,
    userId,
    now,
    confirmImmediately,
  });

  if (!won) {
    if (registration?.status === REGISTRATION_STATUS.CONFIRMED) {
      throw ApiError.conflict('ALREADY_REGISTERED', 'You are already registered for this competition');
    }
    throw ApiError.conflict('REGISTRATION_IN_PROGRESS', 'A registration attempt is already in progress');
  }

  let claimed = await claimSeat(competitionId);

  if (!claimed) {
    // Full - but some of those seats may be holds that have already lapsed.
    // Reclaim them now rather than making this user wait for the sweeper.
    const { released } = await sweepExpiredHolds(competitionId, { now });
    if (released > 0) claimed = await claimSeat(competitionId);
  }

  if (!claimed) {
    // Give the slot back; this user never got a seat.
    await Registration.updateOne(
      { _id: registration._id, seatClaimed: false },
      { $set: { status: REGISTRATION_STATUS.EXPIRED, holdExpiresAt: null }, $inc: { revision: 1 } }
    );
    throw ApiError.conflict('NO_SPOTS_LEFT', 'All spots for this competition are taken');
  }

  // The seat is ours - record ownership so release paths know to return it.
  const owned = await Registration.findOneAndUpdate(
    { _id: registration._id, seatClaimed: false },
    { $set: { seatClaimed: true } },
    { new: true }
  );

  if (!owned) {
    // The slot was retired underneath us (sweeper, cancellation). Do not leak
    // the seat we just claimed.
    await releaseSeat(competitionId);
    throw ApiError.conflict('REGISTRATION_IN_PROGRESS', 'Registration state changed, please retry');
  }

  return { registration: owned, competitionAfter: claimed };
}

async function openPaymentOrder({ competition, userId, registration, idempotencyKey }) {
  const key = idempotencyKey || crypto.randomUUID();

  const alreadyOpen = await Payment.findOne({ idempotencyKey: key });
  if (alreadyOpen) return alreadyOpen;

  const provider = getPaymentProvider();
  const order = await provider.createOrder({
    amountPaise: competition.entryFeePaise,
    currency: competition.currency,
    receipt: `reg_${registration._id}`,
    notes: { competitionId: String(competition._id), userId: String(userId) },
  });

  try {
    const payment = await Payment.create({
      user: userId,
      competition: competition._id,
      registration: registration._id,
      provider: provider.name,
      amountPaise: competition.entryFeePaise,
      currency: competition.currency,
      status: PAYMENT_STATUS.CREATED,
      providerOrderId: order.providerOrderId,
      idempotencyKey: key,
    });
    await Registration.updateOne({ _id: registration._id }, { $set: { payment: payment._id } });
    return payment;
  } catch (err) {
    // Unique index on idempotencyKey: a concurrent identical request won the
    // race and already created this order. Return theirs.
    if (err?.code === 11000) {
      const winner = await Payment.findOne({ idempotencyKey: key });
      if (winner) return winner;
    }
    throw err;
  }
}

function buildCheckoutPayload(competition, payment) {
  return {
    provider: payment.provider,
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    publicKey: 'rzp_test_mock_public_key',
    competitionTitle: competition.title?.en,
  };
}

/** Releases a held seat and marks the registration expired. */
async function expireHold(registration) {
  // Gated on seatClaimed so we only ever hand back a seat this registration
  // actually owns, and the flag flips in the same atomic update.
  const res = await Registration.updateOne(
    { _id: registration._id, status: REGISTRATION_STATUS.HELD, seatClaimed: true },
    {
      $set: { status: REGISTRATION_STATUS.EXPIRED, holdExpiresAt: null, seatClaimed: false },
      $inc: { revision: 1 },
    }
  );
  if (res.modifiedCount === 1) {
    await releaseSeat(registration.competition);
    return;
  }
  await Registration.updateOne(
    { _id: registration._id, status: REGISTRATION_STATUS.HELD, seatClaimed: false },
    { $set: { status: REGISTRATION_STATUS.EXPIRED, holdExpiresAt: null }, $inc: { revision: 1 } }
  );
}

/**
 * Step 2: confirm payment and convert the hold into a confirmed registration.
 *
 * Idempotent, signature-verified, and safe against the nasty case where the
 * gateway succeeds *after* the hold has already lapsed.
 */
export async function confirmRegistrationPayment({
  userId,
  providerOrderId,
  providerPaymentId,
  signature,
}) {
  const payment = await Payment.findOne({ providerOrderId });
  if (!payment) throw ApiError.notFound('PAYMENT_NOT_FOUND', 'Payment order not found');
  if (String(payment.user) !== String(userId)) {
    throw ApiError.forbidden('PAYMENT_NOT_YOURS', 'This payment belongs to another user');
  }

  const provider = getPaymentProvider();
  const valid = provider.verifyPaymentSignature({ providerOrderId, providerPaymentId, signature });
  if (!valid) {
    await Payment.updateOne(
      { _id: payment._id, status: PAYMENT_STATUS.CREATED },
      { $set: { status: PAYMENT_STATUS.FAILED, failureReason: 'SIGNATURE_MISMATCH' } }
    );
    throw ApiError.badRequest('INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed');
  }

  const registration = await Registration.findById(payment.registration);
  if (!registration) throw ApiError.notFound('REGISTRATION_NOT_FOUND', 'Registration not found');

  // Replayed confirmation - already applied.
  if (payment.status === PAYMENT_STATUS.PAID) {
    return { registration, payment, alreadyProcessed: true };
  }

  const now = new Date();

  // Guarded transition: only a live hold may be confirmed here.
  const confirmed = await Registration.findOneAndUpdate(
    { _id: registration._id, status: REGISTRATION_STATUS.HELD, holdExpiresAt: { $gt: now } },
    {
      $set: {
        status: REGISTRATION_STATUS.CONFIRMED,
        holdExpiresAt: null,
        confirmedAt: now,
        amountPaidPaise: payment.amountPaise,
        payment: payment._id,
      },
      $inc: { revision: 1 },
    },
    { new: true }
  );

  if (confirmed) {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: PAYMENT_STATUS.PAID, providerPaymentId, providerSignature: signature } }
    );
    return {
      registration: confirmed,
      payment: await Payment.findById(payment._id),
      alreadyProcessed: false,
    };
  }

  // The hold lapsed while the user was on the gateway, and the seat went back
  // to the pool. We have their money. Try to reclaim a seat; if the competition
  // has since filled, the honest outcome is an automatic refund - never a
  // silent capture, and never an oversold competition.
  return reclaimSeatAfterLatePayment({ payment, registration, providerPaymentId, signature, now });
}

async function reclaimSeatAfterLatePayment({
  payment,
  registration,
  providerPaymentId,
  signature,
  now,
}) {
  const alreadyConfirmed = await Registration.findOne({
    _id: registration._id,
    status: REGISTRATION_STATUS.CONFIRMED,
  });
  if (alreadyConfirmed) {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: PAYMENT_STATUS.PAID, providerPaymentId, providerSignature: signature } }
    );
    return { registration: alreadyConfirmed, payment, alreadyProcessed: true };
  }

  await sweepExpiredHolds(registration.competition, { now });
  const reclaimed = await claimSeat(registration.competition);

  if (reclaimed) {
    const confirmed = await Registration.findOneAndUpdate(
      {
        _id: registration._id,
        status: { $in: [REGISTRATION_STATUS.EXPIRED, REGISTRATION_STATUS.HELD] },
      },
      {
        $set: {
          status: REGISTRATION_STATUS.CONFIRMED,
          holdExpiresAt: null,
          confirmedAt: now,
          amountPaidPaise: payment.amountPaise,
          payment: payment._id,
          seatClaimed: true,
        },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (confirmed) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: PAYMENT_STATUS.PAID, providerPaymentId, providerSignature: signature } }
      );
      logger.warn(`Late payment reclaimed a seat for registration ${registration._id}`);
      return { registration: confirmed, payment, alreadyProcessed: false, lateReclaim: true };
    }
    await releaseSeat(registration.competition); // could not apply - give it back
  }

  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: PAYMENT_STATUS.REFUNDED,
        providerPaymentId,
        providerSignature: signature,
        refundedAt: now,
        failureReason: 'HOLD_EXPIRED_AND_COMPETITION_FULL',
      },
    }
  );
  logger.warn(`Auto-refunding payment ${payment._id}: hold expired and no seats remain`);

  throw ApiError.conflict(
    'SEAT_LOST_REFUND_INITIATED',
    'Your payment window expired and the remaining spots were taken. A refund has been initiated.'
  );
}

/** User-initiated cancellation. Returns the seat to the pool. */
export async function cancelRegistration({ userId, competitionId }) {
  const competition = await loadPublishedCompetition(competitionId);
  const registration = await Registration.findOne({ competition: competitionId, user: userId });

  const isActive =
    registration &&
    [REGISTRATION_STATUS.HELD, REGISTRATION_STATUS.CONFIRMED].includes(registration.status);

  if (!isActive) {
    throw ApiError.notFound('REGISTRATION_NOT_FOUND', 'No active registration to cancel');
  }

  // Once registration closes a freed seat cannot be meaningfully resold, so
  // self-service cancellation closes with it.
  if (new Date() >= competition.dates.registrationClosesAt) {
    throw ApiError.conflict(
      'CANCELLATION_WINDOW_CLOSED',
      'Registration has closed; contact support for refunds'
    );
  }

  const res = await Registration.updateOne(
    {
      _id: registration._id,
      status: { $in: [REGISTRATION_STATUS.HELD, REGISTRATION_STATUS.CONFIRMED] },
      seatClaimed: true,
    },
    {
      $set: {
        status: REGISTRATION_STATUS.CANCELLED,
        holdExpiresAt: null,
        cancelledAt: new Date(),
        seatClaimed: false,
      },
      $inc: { revision: 1 },
    }
  );

  if (res.modifiedCount === 1) {
    await releaseSeat(competitionId);
    if (registration.status === REGISTRATION_STATUS.CONFIRMED && registration.payment) {
      await Payment.updateOne(
        { _id: registration.payment, status: PAYMENT_STATUS.PAID },
        { $set: { status: PAYMENT_STATUS.REFUNDED, refundedAt: new Date() } }
      );
    }
  }

  return Registration.findById(registration._id);
}
