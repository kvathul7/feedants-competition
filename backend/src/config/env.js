import dotenv from 'dotenv';
dotenv.config();

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),

  // When empty, the server boots a disposable in-memory MongoDB replica set.
  // Replica set (not standalone) because we rely on multi-document transactions.
  mongoUri: process.env.MONGODB_URI || '',
  mongoDbName: process.env.MONGODB_DB_NAME || 'feedants',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // How long a seat is held for a user who has started but not completed payment.
  seatHoldSeconds: num(process.env.SEAT_HOLD_SECONDS, 600),
  // How often the background sweeper releases expired seat holds.
  holdSweepIntervalSeconds: num(process.env.HOLD_SWEEP_INTERVAL_SECONDS, 60),

  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock', // 'mock' | 'razorpay'
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret',

  referralRewardAmount: num(process.env.REFERRAL_REWARD_AMOUNT, 10),
  defaultLocale: process.env.DEFAULT_LOCALE || 'en',
  supportedLocales: (process.env.SUPPORTED_LOCALES || 'en,hi').split(','),
};

export const isProd = env.nodeEnv === 'production';
