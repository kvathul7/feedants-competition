import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * Validation happens at the edge so services can assume well-formed input.
 * Parsed values replace the raw ones, giving handlers coerced types rather
 * than strings.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (!schemas[key]) continue;
      const parsed = schemas[key].parse(req[key]);
      // req.query is a getter on newer Express; assign field-by-field.
      if (key === 'query') Object.assign(req.query, parsed);
      else req[key] = parsed;
    }
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(
        ApiError.badRequest(
          'VALIDATION_ERROR',
          'Request failed validation',
          err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
        )
      );
    }
    next(err);
  }
};

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

/** Reads the locale from ?locale=, falling back to Accept-Language then default. */
export function localeResolver(req, _res, next) {
  const requested =
    req.query?.locale ||
    req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
    env.defaultLocale;

  req.locale = env.supportedLocales.includes(requested) ? requested : env.defaultLocale;
  next();
}

export const schemas = {
  startRegistration: {
    params: z.object({ id: objectId }),
    body: z
      .object({ idempotencyKey: z.string().min(8).max(128).optional() })
      .default({}),
  },
  confirmPayment: {
    body: z.object({
      orderId: z.string().min(4),
      paymentId: z.string().min(4),
      signature: z.string().min(16),
    }),
  },
  submission: {
    params: z.object({ id: objectId }),
    body: z.object({
      mediaUrl: z.string().url('must be a valid URL'),
      caption: z.string().max(500).optional(),
    }),
  },
  devLogin: {
    body: z.object({ email: z.string().email() }),
  },
  competitionParam: {
    params: z.object({ id: z.string().min(1) }),
  },
};
