import { ApiError } from '../utils/ApiError.js';
import { Competition } from '../models/Competition.js';
import { Registration, REGISTRATION_STATUS } from '../models/Registration.js';
import { Submission, SUBMISSION_STATUS } from '../models/Submission.js';
import { canSubmit } from './lifecycleService.js';

/**
 * Accepts or replaces a participant's entry.
 *
 * Three gates, in order of cheapness: the competition must be in its
 * submission window, the user must hold a confirmed (paid) registration, and
 * the write itself is an upsert so a re-upload replaces rather than duplicates.
 */
export async function upsertSubmission({ userId, competitionId, mediaUrl, caption }) {
  const competition = await Competition.findById(competitionId);
  if (!competition || competition.status === 'draft') {
    throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');
  }

  const now = new Date();
  const gate = canSubmit({ competition, now });
  if (!gate.ok) {
    throw new ApiError(gate.code === 'SUBMISSION_CLOSED' ? 410 : 409, gate.code, `Cannot submit: ${gate.code}`);
  }

  const registration = await Registration.findOne({ competition: competitionId, user: userId });

  if (!registration || registration.status !== REGISTRATION_STATUS.CONFIRMED) {
    // Mirrors the disclaimer in the design: only paid participants are judged.
    throw ApiError.forbidden(
      'NOT_A_CONFIRMED_PARTICIPANT',
      'Only confirmed participants can upload a submission'
    );
  }

  const existing = await Submission.findOne({ competition: competitionId, user: userId });

  const submission = await Submission.findOneAndUpdate(
    { competition: competitionId, user: userId },
    {
      $set: {
        mediaUrl,
        caption,
        registration: registration._id,
        submittedAt: now,
        status: SUBMISSION_STATUS.SUBMITTED,
      },
      /**
       * `revision` is handled by exactly one operator per call. The schema
       * default cannot be relied on (naming the field in $inc suppresses it,
       * landing a first submission on 0), and naming it in both $inc and
       * $setOnInsert is a conflicting-path error. So: increment on a genuine
       * replacement, seed it on insert, never both.
       */
      ...(existing ? { $inc: { revision: 1 } } : {}),
      $setOnInsert: existing
        ? { competition: competitionId, user: userId }
        : { competition: competitionId, user: userId, revision: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { submission, replaced: Boolean(existing) };
}

export async function getMySubmission({ userId, competitionId }) {
  const submission = await Submission.findOne({ competition: competitionId, user: userId });
  if (!submission) throw ApiError.notFound('SUBMISSION_NOT_FOUND', 'No submission found');
  return submission;
}

/**
 * Withdrawing an entry is only possible while the window is open - after it
 * closes the entry is locked for judging.
 */
export async function withdrawSubmission({ userId, competitionId }) {
  const competition = await Competition.findById(competitionId);
  if (!competition) throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');

  const gate = canSubmit({ competition });
  if (!gate.ok) {
    throw ApiError.conflict('SUBMISSION_WINDOW_CLOSED', 'Entries are locked for judging');
  }

  const res = await Submission.deleteOne({ competition: competitionId, user: userId });
  if (res.deletedCount === 0) throw ApiError.notFound('SUBMISSION_NOT_FOUND', 'No submission found');
  return { withdrawn: true };
}
