import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate, schemas, localeResolver } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as c from '../controllers/index.js';

const router = Router();

/**
 * Write endpoints are rate limited per user (falling back to IP for anonymous
 * callers). Registration is the contended path - without a limit, one client
 * retrying in a loop can monopolise the seat counter and starve real users.
 */
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
});

router.use(localeResolver);

// ---- auth ------------------------------------------------------------------
router.post('/auth/dev-login', validate(schemas.devLogin), asyncHandler(c.devLogin));
router.get('/auth/me', requireAuth, asyncHandler(c.me));

// ---- competitions ----------------------------------------------------------
router.get('/competitions', asyncHandler(c.getList));

// optionalAuth: the details screen renders for signed-out visitors, just
// without viewer-specific state.
router.get(
  '/competitions/:id',
  optionalAuth,
  validate(schemas.competitionParam),
  asyncHandler(c.getDetails)
);

router.get(
  '/competitions/:id/winners',
  validate(schemas.competitionParam),
  asyncHandler(c.getCompetitionWinners)
);

// ---- registration ----------------------------------------------------------
router.post(
  '/competitions/:id/registrations',
  requireAuth,
  writeLimiter,
  validate(schemas.startRegistration),
  asyncHandler(c.postRegistration)
);

router.delete(
  '/competitions/:id/registrations',
  requireAuth,
  writeLimiter,
  validate(schemas.competitionParam),
  asyncHandler(c.deleteRegistration)
);

router.get('/me/registrations', requireAuth, asyncHandler(c.getMyRegistrations));

// ---- payments --------------------------------------------------------------
router.post(
  '/payments/confirm',
  requireAuth,
  writeLimiter,
  validate(schemas.confirmPayment),
  asyncHandler(c.postConfirmPayment)
);

// Unauthenticated by design - authenticity comes from the HMAC signature over
// the raw body, not from a session.
router.post('/webhooks/payments', asyncHandler(c.postPaymentWebhook));

// ---- submissions -----------------------------------------------------------
router.put(
  '/competitions/:id/submission',
  requireAuth,
  writeLimiter,
  validate(schemas.submission),
  asyncHandler(c.putSubmission)
);

router.get(
  '/competitions/:id/submission',
  requireAuth,
  validate(schemas.competitionParam),
  asyncHandler(c.getSubmission)
);

router.delete(
  '/competitions/:id/submission',
  requireAuth,
  validate(schemas.competitionParam),
  asyncHandler(c.deleteSubmission)
);

// ---- ops -------------------------------------------------------------------
router.get(
  '/ops/competitions/:id/capacity-audit',
  validate(schemas.competitionParam),
  asyncHandler(c.getCapacityAudit)
);

export default router;
