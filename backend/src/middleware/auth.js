import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

/**
 * Auth is deliberately thin: a signed JWT carrying the user id, verified on
 * every request. The assignment does not ask for a full identity system, so
 * there is no password/OTP flow - but the *shape* is the real one, so swapping
 * in Firebase, Cognito or an OTP service means replacing only the token issuer
 * in authController, not any downstream code.
 */

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      'Session is no longer valid, please sign in again'
    );
  }
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('USER_NOT_FOUND', 'Account no longer exists');
  return user;
}

/** Hard gate: request fails without a valid token. */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized();
    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Soft gate: the details screen must render for signed-out visitors too, just
 * without any viewer-specific state. A bad token is treated as signed-out
 * rather than an error, so an expired session still shows the page.
 */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch {
    req.user = null;
  }
  next();
}
