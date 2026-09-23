import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Payment provider abstraction.
 *
 * The mock provider deliberately implements Razorpay's *actual* contract -
 * order ids, HMAC-SHA256 signatures over `orderId|paymentId`, and webhook
 * signatures over the raw request body. Swapping in the real SDK is then a
 * matter of replacing this module's `createOrder` call, with no change to the
 * callers, the verification logic, or the client.
 */

const hmac = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

/** Constant-time compare - signature checks must not leak via timing. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

const mockProvider = {
  name: 'mock',

  async createOrder({ amountPaise, currency, receipt, notes }) {
    return {
      providerOrderId: `order_mock_${crypto.randomBytes(9).toString('hex')}`,
      amountPaise,
      currency,
      receipt,
      notes,
      // Real Razorpay returns the public key id for the checkout SDK.
      publicKey: 'rzp_test_mock_public_key',
    };
  },

  verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
    const expected = hmac(`${providerOrderId}|${providerPaymentId}`, env.paymentWebhookSecret);
    return safeEqual(expected, signature);
  },

  verifyWebhookSignature({ rawBody, signature }) {
    return safeEqual(hmac(rawBody, env.paymentWebhookSecret), signature);
  },

  /**
   * Test-only affordance: produces the signature a real checkout SDK would
   * hand back, so the app and the test-suite can complete a payment without a
   * live gateway. Absent from the razorpay adapter by design.
   */
  __signForTesting({ providerOrderId, providerPaymentId }) {
    return hmac(`${providerOrderId}|${providerPaymentId}`, env.paymentWebhookSecret);
  },
};

const razorpayProvider = {
  name: 'razorpay',

  async createOrder() {
    // Intentionally unimplemented: wiring this up requires live API keys.
    // The surface is identical to the mock, so only this method changes.
    throw ApiError.badRequest(
      'PAYMENT_PROVIDER_UNCONFIGURED',
      'Razorpay adapter requires RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and the razorpay SDK'
    );
  },

  verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
    return safeEqual(hmac(`${providerOrderId}|${providerPaymentId}`, env.razorpayKeySecret), signature);
  },

  verifyWebhookSignature({ rawBody, signature }) {
    return safeEqual(hmac(rawBody, env.paymentWebhookSecret), signature);
  },
};

export function getPaymentProvider() {
  return env.paymentProvider === 'razorpay' ? razorpayProvider : mockProvider;
}

export const isMockProvider = () => env.paymentProvider !== 'razorpay';
