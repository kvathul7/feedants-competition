import mongoose from 'mongoose';

export const PAYMENT_STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },

    provider: { type: String, required: true, default: 'mock' }, // 'mock' | 'razorpay'
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },

    providerOrderId: { type: String, required: true },
    providerPaymentId: { type: String, default: null },
    providerSignature: { type: String, default: null },

    /**
     * Client-supplied key deduplicating retried "start payment" calls. A user
     * double-tapping Register must not produce two orders against two seats.
     */
    idempotencyKey: { type: String, required: true },

    /**
     * Webhook delivery is at-least-once, so every provider event id we have
     * already applied is recorded here and re-deliveries become no-ops.
     */
    processedEventIds: { type: [String], default: [] },

    failureReason: { type: String, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ providerOrderId: 1 }, { unique: true });
paymentSchema.index({ registration: 1, status: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
