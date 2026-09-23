import mongoose from 'mongoose';

export const REGISTRATION_STATUS = {
  HELD: 'held',           // seat reserved, payment not yet completed
  CONFIRMED: 'confirmed', // paid (or free entry) - participant is in
  EXPIRED: 'expired',     // hold lapsed before payment, seat returned to pool
  CANCELLED: 'cancelled', // user or admin cancelled
  REFUNDED: 'refunded',   // competition cancelled / refund issued
};

/** Statuses that occupy a seat in Competition.capacity.booked. */
export const SEAT_OCCUPYING_STATUSES = [REGISTRATION_STATUS.HELD, REGISTRATION_STATUS.CONFIRMED];

const registrationSchema = new mongoose.Schema(
  {
    competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: Object.values(REGISTRATION_STATUS),
      required: true,
      default: REGISTRATION_STATUS.HELD,
    },

    // Wall-clock deadline for completing payment on a held seat. Null once
    // confirmed. The sweeper and the read path both treat an elapsed hold as
    // already released, so a late sweep never shows a stale "sold out".
    holdExpiresAt: { type: Date, default: null },

    /**
     * Whether this registration currently owns a seat in
     * Competition.capacity.booked.
     *
     * The seat claim and the registration write are two separate atomic
     * operations, so there is a window where the registration exists but the
     * seat has not been claimed yet (or the process died between the two).
     * Without this flag a sweeper could release a seat the registration never
     * held, drifting the counter below the true occupancy. Every release path
     * is therefore gated on this being true, and flips it false in the same
     * update.
     */
    seatClaimed: { type: Boolean, default: false },

    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    amountPaidPaise: { type: Number, default: 0, min: 0 },

    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    // Monotonic counter bumped on every status transition. Lets clients detect
    // stale reads and makes transitions traceable without a separate log.
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/**
 * One registration document per (competition, user), for the lifetime of that
 * pair. Retrying after an expired hold reuses the same document rather than
 * inserting a second one - which makes "am I registered?" a single-document
 * read and makes double-registration structurally impossible rather than
 * merely validated against.
 */
registrationSchema.index({ competition: 1, user: 1 }, { unique: true });

// Sweeper query: find lapsed holds.
registrationSchema.index({ status: 1, holdExpiresAt: 1 });
// Participant listing for a competition.
registrationSchema.index({ competition: 1, status: 1, confirmedAt: -1 });

registrationSchema.methods.isActiveHold = function isActiveHold(now = new Date()) {
  return this.status === REGISTRATION_STATUS.HELD && this.holdExpiresAt > now;
};

export const Registration = mongoose.model('Registration', registrationSchema);
