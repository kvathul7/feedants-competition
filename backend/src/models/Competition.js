import mongoose from 'mongoose';
import { localizedStringSchema } from './localizedString.js';

/**
 * Competition lifecycle phases, derived from dates at read time rather than
 * stored. Storing a phase would require a cron to flip it and would be wrong
 * for the window between the cron ticks; deriving it makes the API correct at
 * every instant and keeps the clock authoritative on the server.
 */
export const PHASE = {
  UPCOMING: 'upcoming',                     // registration has not opened yet
  REGISTRATION_OPEN: 'registration_open',
  REGISTRATION_CLOSED: 'registration_closed', // closed, submissions not open yet
  SUBMISSION_OPEN: 'submission_open',
  SUBMISSION_CLOSED: 'submission_closed',   // judging in progress
  RESULTS_DECLARED: 'results_declared',
  CANCELLED: 'cancelled',
};

const rewardSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true, min: 1 },
    amountPaise: { type: Number, required: true, min: 0 },
    label: { type: localizedStringSchema },
  },
  { _id: false }
);

const previousWinnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    position: { type: Number, required: true, min: 1 },
    thumbnailUrl: { type: String },
    videoUrl: { type: String },
    edition: { type: String },
  },
  { _id: false }
);

/**
 * Declared as a sub-schema rather than an inline object so the cross-field
 * ordering rules below can attach as a real path validator - which means they
 * run under validateSync() too, not only on save().
 */
const datesSchema = new mongoose.Schema(
  {
    registrationOpensAt: { type: Date, required: true },
    registrationClosesAt: { type: Date, required: true },
    submissionStartsAt: { type: Date, required: true },
    submissionEndsAt: { type: Date, required: true },
    resultAt: { type: Date, required: true },
  },
  { _id: false }
);

const competitionSchema = new mongoose.Schema(
  {
    title: { type: localizedStringSchema, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    category: { type: String, required: true, index: true },       // "Dance"
    tags: [{ type: localizedStringSchema }],                        // ["Dance", "Multi-Win"]
    multiWin: { type: Boolean, default: false },
    certificateOnWin: { type: Boolean, default: true },

    // ---- Money -------------------------------------------------------------
    // All amounts are integer paise. Never floats: ₹99.00 in float arithmetic
    // silently drifts, and payment reconciliation must be exact.
    prizePoolPaise: { type: Number, required: true, min: 0 },
    entryFeePaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    rewards: { type: [rewardSchema], default: [] },

    // ---- Capacity ----------------------------------------------------------
    // `booked` counts confirmed registrations AND live (unexpired) seat holds.
    // It is only ever mutated through atomic $inc guarded by a $lt predicate,
    // never by read-modify-write, so it cannot oversell under concurrency.
    capacity: {
      total: { type: Number, required: true, min: 1 },
      booked: { type: Number, required: true, default: 0, min: 0 },
    },

    // ---- Lifecycle dates ---------------------------------------------------
    dates: { type: datesSchema, required: true },

    judge: { type: mongoose.Schema.Types.ObjectId, ref: 'Judge', required: true },

    // ---- Tabbed content ----------------------------------------------------
    content: {
      about: { type: localizedStringSchema, required: true },
      judgingParameters: [{ type: localizedStringSchema }],
      rulesAndEligibility: [{ type: localizedStringSchema }],
    },

    disclaimer: { type: localizedStringSchema },
    prizeMoneyVideoUrl: { type: String },
    refundPolicyUrl: { type: String },
    previousWinners: { type: [previousWinnerSchema], default: [] },

    bannerUrl: { type: String },

    // Admin-controlled publication state, independent of the date-derived phase.
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled'],
      default: 'draft',
      index: true,
    },
    cancelledReason: { type: String },
  },
  { timestamps: true }
);

// Listing feed: published competitions ordered by closing time.
competitionSchema.index({ status: 1, 'dates.registrationClosesAt': 1 });
// Category browse.
competitionSchema.index({ status: 1, category: 1, 'dates.registrationClosesAt': 1 });

// ---- Invariants ------------------------------------------------------------
// Expressed as path validators (not a pre-validate hook) so they hold for
// validateSync(), save(), and create() alike.

competitionSchema.path('dates').validate(function validateDateOrder(d) {
  if (!d) return false;
  if (d.registrationOpensAt >= d.registrationClosesAt) return false;
  if (d.submissionStartsAt >= d.submissionEndsAt) return false;
  // Results cannot be declared before entries stop arriving. Note that the
  // registration and submission windows are deliberately allowed to overlap -
  // the reference design does exactly that.
  if (d.submissionEndsAt > d.resultAt) return false;
  return true;
}, 'Invalid date ordering: registration/submission windows must be well-formed and resultAt must not precede submissionEndsAt');

competitionSchema.path('rewards').validate(function validateRewards(rewards) {
  if (!rewards?.length) return true;

  // The design shows a prize pool of Rs 1,500 and rewards summing to exactly
  // Rs 1,500. Treating those as two independent fields invites them to drift.
  const sum = rewards.reduce((acc, r) => acc + r.amountPaise, 0);
  if (sum !== this.prizePoolPaise) return false;

  const positions = rewards.map((r) => r.position);
  return new Set(positions).size === positions.length;
}, 'rewards must have unique positions and sum to exactly prizePoolPaise');

competitionSchema.path('capacity.booked').validate(function validateBooked(booked) {
  return booked <= this.capacity.total;
}, 'capacity.booked cannot exceed capacity.total');

/**
 * The registration and submission windows are independent intervals, not a
 * linear sequence. The reference design proves it: submissions open 6 Aug
 * while registration runs until 10 Aug, so for four days both are open at
 * once. Deriving one ordered phase from a chain of `if` comparisons would
 * silently report SUBMISSION_OPEN as REGISTRATION_OPEN and lock paid
 * participants out of uploading.
 *
 * So windows are evaluated independently, and `phaseAt` is only a headline
 * summary for the banner. Authorisation always goes through `windows()`.
 */
competitionSchema.methods.windows = function windows(now = new Date()) {
  const d = this.dates;
  return {
    cancelled: this.status === 'cancelled',
    beforeRegistration: now < d.registrationOpensAt,
    registrationOpen: now >= d.registrationOpensAt && now < d.registrationClosesAt,
    submissionOpen: now >= d.submissionStartsAt && now < d.submissionEndsAt,
    beforeSubmission: now < d.submissionStartsAt,
    resultsOut: now >= d.resultAt,
  };
};

/** Headline phase for display. Precedence: submission beats registration. */
competitionSchema.methods.phaseAt = function phaseAt(now = new Date()) {
  const w = this.windows(now);
  if (w.cancelled) return PHASE.CANCELLED;
  if (w.resultsOut) return PHASE.RESULTS_DECLARED;
  if (w.submissionOpen) return PHASE.SUBMISSION_OPEN;
  if (w.registrationOpen) return PHASE.REGISTRATION_OPEN;
  if (w.beforeRegistration) return PHASE.UPCOMING;
  if (w.beforeSubmission) return PHASE.REGISTRATION_CLOSED;
  return PHASE.SUBMISSION_CLOSED;
};

competitionSchema.methods.spotsLeft = function spotsLeft() {
  return Math.max(0, this.capacity.total - this.capacity.booked);
};

competitionSchema.methods.isSoldOut = function isSoldOut() {
  return this.capacity.booked >= this.capacity.total;
};

export const Competition = mongoose.model('Competition', competitionSchema);
