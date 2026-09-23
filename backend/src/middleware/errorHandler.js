import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

/** Wraps an async route so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

/**
 * Single error shape for the whole API:
 *   { error: { code, message, details? }, requestId }
 *
 * The client switches on `code`, never on the message text - so copy can change
 * (or be translated) without breaking behaviour.
 */
export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // Mongoose validation -> 400 with per-field details.
  if (err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    details = Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message }));
    message = 'Request failed validation';
  } else if (err.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_KEY';
    message = 'That record already exists';
    details = err.keyValue;
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} ->`, err.stack || err.message);
    if (isProd) message = 'Something went wrong';
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${status} ${code}`);
  }

  res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
    requestId: req.id,
  });
}
