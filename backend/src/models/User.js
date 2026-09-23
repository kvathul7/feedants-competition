import mongoose from 'mongoose';
import crypto from 'node:crypto';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    avatarUrl: { type: String },
    locale: { type: String, enum: ['en', 'hi'], default: 'en' },

    // Referral programme shown at the bottom of the design.
    referralCode: { type: String, unique: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralEarningsPaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

userSchema.pre('validate', function assignReferralCode(next) {
  if (!this.referralCode) {
    this.referralCode = crypto.randomBytes(5).toString('hex');
  }
  next();
});

export const User = mongoose.model('User', userSchema);
