import { REGISTRATION_STATUS } from '../models/Registration.js';

/**
 * Canonical set of primary actions the client can render on the bottom CTA.
 * The server decides which one applies; the app only maps it to a label and a
 * handler. Putting this decision in the client would mean re-implementing
 * every business rule there, and drifting from it on the next rule change.
 */
export const ACTION = {
  REGISTER: 'register',                    // enabled, seats available
  COMPLETE_PAYMENT: 'complete_payment',    // seat held, payment pending
  UPLOAD_SUBMISSION: 'upload_submission',  // registered, submission window open
  EDIT_SUBMISSION: 'edit_submission',      // already submitted, window still open
  VIEW_SUBMISSION: 'view_submission',      // window closed, entry locked in
  VIEW_RESULTS: 'view_results',
  SOLD_OUT: 'sold_out',
  REGISTRATION_NOT_OPEN: 'registration_not_open',
  REGISTRATION_CLOSED: 'registration_closed',
  AWAITING_SUBMISSION_WINDOW: 'awaiting_submission_window',
  MISSED_SUBMISSION: 'missed_submission',  // registered but never submitted
  CANCELLED: 'cancelled',
};

/**
 * Pure function: given competition state, the viewer's registration and
 * submission, and the server clock, produce the viewer-specific action.
 *
 * Kept free of I/O so it is exhaustively unit-testable across the
 * window x registration-state matrix.
 */
export function resolveViewerAction({ competition, registration, submission, now = new Date() }) {
  const w = competition.windows(now);
  const soldOut = competition.isSoldOut();

  if (w.cancelled) {
    return { action: ACTION.CANCELLED, enabled: false, reason: 'COMPETITION_CANCELLED' };
  }

  const hasActiveHold =
    registration?.status === REGISTRATION_STATUS.HELD && registration.holdExpiresAt > now;
  const isConfirmed = registration?.status === REGISTRATION_STATUS.CONFIRMED;

  // A participant who is in stays in, regardless of how full it later got.
  if (isConfirmed) {
    if (w.submissionOpen) {
      return submission
        ? { action: ACTION.EDIT_SUBMISSION, enabled: true, closesAt: competition.dates.submissionEndsAt }
        : { action: ACTION.UPLOAD_SUBMISSION, enabled: true, closesAt: competition.dates.submissionEndsAt };
    }
    if (w.beforeSubmission) {
      return {
        action: ACTION.AWAITING_SUBMISSION_WINDOW,
        enabled: false,
        reason: 'SUBMISSION_NOT_OPEN',
        opensAt: competition.dates.submissionStartsAt,
      };
    }
    // Submission window has closed.
    if (w.resultsOut) return { action: ACTION.VIEW_RESULTS, enabled: true };
    return submission
      ? { action: ACTION.VIEW_SUBMISSION, enabled: true, resultAt: competition.dates.resultAt }
      : { action: ACTION.MISSED_SUBMISSION, enabled: false, reason: 'SUBMISSION_WINDOW_MISSED' };
  }

  // Seat held but unpaid: finishing payment takes priority over everything,
  // and stays available even if that hold pushed the competition to full.
  if (hasActiveHold) {
    if (w.registrationOpen) {
      return {
        action: ACTION.COMPLETE_PAYMENT,
        enabled: true,
        holdExpiresAt: registration.holdExpiresAt,
      };
    }
    // Registration closed while the user sat on the payment screen.
    return { action: ACTION.REGISTRATION_CLOSED, enabled: false, reason: 'REGISTRATION_CLOSED' };
  }

  // Not registered.
  if (w.registrationOpen) {
    return soldOut
      ? { action: ACTION.SOLD_OUT, enabled: false, reason: 'NO_SPOTS_LEFT' }
      : {
          action: ACTION.REGISTER,
          enabled: true,
          entryFeePaise: competition.entryFeePaise,
          closesAt: competition.dates.registrationClosesAt,
        };
  }
  if (w.beforeRegistration) {
    return {
      action: ACTION.REGISTRATION_NOT_OPEN,
      enabled: false,
      reason: 'REGISTRATION_NOT_OPEN',
      opensAt: competition.dates.registrationOpensAt,
    };
  }
  if (w.resultsOut) return { action: ACTION.VIEW_RESULTS, enabled: true };

  return { action: ACTION.REGISTRATION_CLOSED, enabled: false, reason: 'REGISTRATION_CLOSED' };
}

/** Guard used by write endpoints. Callers map the code to an ApiError. */
export function canRegister({ competition, now = new Date() }) {
  const w = competition.windows(now);
  if (w.cancelled) return { ok: false, code: 'COMPETITION_CANCELLED' };
  if (w.beforeRegistration) return { ok: false, code: 'REGISTRATION_NOT_OPEN' };
  if (!w.registrationOpen) return { ok: false, code: 'REGISTRATION_CLOSED' };
  return { ok: true };
}

export function canSubmit({ competition, now = new Date() }) {
  const w = competition.windows(now);
  if (w.cancelled) return { ok: false, code: 'COMPETITION_CANCELLED' };
  if (w.submissionOpen) return { ok: true };
  if (w.beforeSubmission) return { ok: false, code: 'SUBMISSION_NOT_OPEN' };
  return { ok: false, code: 'SUBMISSION_CLOSED' };
}
