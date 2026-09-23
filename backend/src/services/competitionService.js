import { Competition, PHASE } from '../models/Competition.js';
import { Registration, REGISTRATION_STATUS } from '../models/Registration.js';
import { Submission } from '../models/Submission.js';
import { Judge } from '../models/Judge.js';
import { ApiError } from '../utils/ApiError.js';
import { resolveLocale, resolveDeep } from '../models/localizedString.js';
import { resolveViewerAction } from './lifecycleService.js';
import { env } from '../config/env.js';

const rupees = (paise) => paise / 100;

/**
 * Which deadline the countdown banner should track, given the phase. The
 * design shows "Registration closes in ..."; the same component is reused for
 * the submission deadline and the result announcement rather than special-cased
 * on the client.
 */
function buildCountdown(competition, now) {
  const d = competition.dates;
  const w = competition.windows(now);

  // Registration deliberately outranks submission while both are open: the
  // closing deadline is the one the user can still miss irrecoverably, and it
  // is what the reference design surfaces.
  let entry = null;
  if (w.cancelled) return null;
  else if (w.beforeRegistration) entry = { key: 'registration_opens_in', target: d.registrationOpensAt };
  else if (w.registrationOpen) entry = { key: 'registration_closes_in', target: d.registrationClosesAt };
  else if (w.submissionOpen) entry = { key: 'submission_closes_in', target: d.submissionEndsAt };
  else if (w.beforeSubmission) entry = { key: 'submission_opens_in', target: d.submissionStartsAt };
  else if (!w.resultsOut) entry = { key: 'results_in', target: d.resultAt };

  if (!entry) return null;

  const msRemaining = entry.target.getTime() - now.getTime();
  return {
    key: entry.key,
    targetAt: entry.target,
    secondsRemaining: Math.max(0, Math.floor(msRemaining / 1000)),
    // Drives the "Hurry up!" treatment. 48h, not 24h: the design shows the
    // urgent state next to a 01d:06h countdown, so the threshold has to clear it.
    urgent: msRemaining > 0 && msRemaining <= 48 * 60 * 60 * 1000,
  };
}

function serializeCompetition(competition, judge, locale) {
  return {
    id: competition._id,
    slug: competition.slug,
    title: resolveLocale(competition.title, locale),
    category: competition.category,
    tags: (competition.tags || []).map((t) => resolveLocale(t, locale)),
    multiWin: competition.multiWin,
    certificateOnWin: competition.certificateOnWin,
    bannerUrl: competition.bannerUrl,

    prizePool: { paise: competition.prizePoolPaise, amount: rupees(competition.prizePoolPaise), currency: competition.currency },
    entryFee: { paise: competition.entryFeePaise, amount: rupees(competition.entryFeePaise), currency: competition.currency },

    rewards: (competition.rewards || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((r) => ({
        position: r.position,
        label: resolveLocale(r.label, locale),
        amount: rupees(r.amountPaise),
        paise: r.amountPaise,
      })),

    judge: judge
      ? {
          id: judge._id,
          name: judge.name,
          title: resolveLocale(judge.title, locale),
          experienceYears: judge.experienceYears,
          photoUrl: judge.photoUrl,
          introVideoUrl: judge.introVideoUrl,
          bio: resolveLocale(judge.bio, locale),
        }
      : null,

    dates: {
      registrationOpensAt: competition.dates.registrationOpensAt,
      registrationClosesAt: competition.dates.registrationClosesAt,
      submissionStartsAt: competition.dates.submissionStartsAt,
      submissionEndsAt: competition.dates.submissionEndsAt,
      resultAt: competition.dates.resultAt,
    },

    content: {
      about: resolveLocale(competition.content.about, locale),
      judgingParameters: (competition.content.judgingParameters || []).map((p) => resolveLocale(p, locale)),
      rulesAndEligibility: (competition.content.rulesAndEligibility || []).map((r) => resolveLocale(r, locale)),
    },

    disclaimer: resolveLocale(competition.disclaimer, locale),
    prizeMoneyVideoUrl: competition.prizeMoneyVideoUrl,
    refundPolicyUrl: competition.refundPolicyUrl,
    previousWinners: resolveDeep(competition.previousWinners, locale),
  };
}

function serializeRegistration(registration) {
  if (!registration) return null;
  return {
    id: registration._id,
    status: registration.status,
    holdExpiresAt: registration.holdExpiresAt,
    confirmedAt: registration.confirmedAt,
    amountPaid: rupees(registration.amountPaidPaise),
    revision: registration.revision,
  };
}

function serializeSubmission(submission) {
  if (!submission) return null;
  return {
    id: submission._id,
    mediaUrl: submission.mediaUrl,
    caption: submission.caption,
    status: submission.status,
    revision: submission.revision,
    submittedAt: submission.submittedAt,
    rank: submission.rank,
    score: submission.score,
  };
}

/**
 * Assembles the entire Competition Details screen in one round trip.
 *
 * One endpoint rather than six: the screen is useless in pieces, and six
 * parallel calls would let the user see a registered badge next to a
 * not-registered CTA while the slowest response was still in flight. A single
 * read is also a single consistent snapshot.
 */
export async function getCompetitionDetails({ idOrSlug, userId = null, locale = env.defaultLocale }) {
  const byId = /^[0-9a-fA-F]{24}$/.test(String(idOrSlug));
  const competition = await Competition.findOne(
    byId ? { _id: idOrSlug } : { slug: String(idOrSlug).toLowerCase() }
  );

  if (!competition || competition.status === 'draft') {
    throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');
  }

  const judge = await Judge.findById(competition.judge).lean();

  // Single authoritative clock. The client renders its countdown against this
  // value plus locally elapsed time, so a device with a wrong system clock (or
  // a user who sets it forward to cheat a deadline) still sees the truth.
  const now = new Date();
  const phase = competition.phaseAt(now);

  let registration = null;
  let submission = null;
  if (userId) {
    [registration, submission] = await Promise.all([
      Registration.findOne({ competition: competition._id, user: userId }),
      Submission.findOne({ competition: competition._id, user: userId }),
    ]);
  }

  const action = resolveViewerAction({ competition, registration, submission, now });

  return {
    serverTime: now,
    competition: serializeCompetition(competition, judge, locale),
    phase,
    countdown: buildCountdown(competition, now),
    capacity: {
      total: competition.capacity.total,
      booked: competition.capacity.booked,
      spotsLeft: competition.spotsLeft(),
      percentBooked: Math.round((competition.capacity.booked / competition.capacity.total) * 100),
      soldOut: competition.isSoldOut(),
    },
    viewer: {
      authenticated: Boolean(userId),
      registration: serializeRegistration(registration),
      submission: serializeSubmission(submission),
      action,
    },
    locale,
  };
}

/** Lightweight list feed - used by the app to reach the details screen. */
export async function listCompetitions({ locale = env.defaultLocale, limit = 20, cursor = null }) {
  const filter = { status: 'published' };
  if (cursor) filter['dates.registrationClosesAt'] = { $gt: new Date(cursor) };

  const items = await Competition.find(filter)
    .sort({ 'dates.registrationClosesAt': 1 })
    .limit(Math.min(limit, 50))
    .lean();

  const now = new Date();
  return {
    serverTime: now,
    items: items.map((c) => ({
      id: c._id,
      slug: c.slug,
      title: resolveLocale(c.title, locale),
      category: c.category,
      entryFee: rupees(c.entryFeePaise),
      prizePool: rupees(c.prizePoolPaise),
      spotsLeft: Math.max(0, c.capacity.total - c.capacity.booked),
      registrationClosesAt: c.dates.registrationClosesAt,
      bannerUrl: c.bannerUrl,
    })),
    nextCursor: items.length ? items[items.length - 1].dates.registrationClosesAt : null,
  };
}

/** Results / previous winners for the competition. */
export async function getWinners({ competitionId }) {
  const competition = await Competition.findById(competitionId);
  if (!competition) throw ApiError.notFound('COMPETITION_NOT_FOUND', 'Competition not found');

  if (competition.phaseAt() !== PHASE.RESULTS_DECLARED) {
    throw ApiError.conflict('RESULTS_NOT_DECLARED', 'Results have not been declared yet');
  }

  const winners = await Submission.find({ competition: competitionId, rank: { $ne: null } })
    .sort({ rank: 1 })
    .populate('user', 'name avatarUrl')
    .lean();

  return winners.map((w) => ({
    rank: w.rank,
    score: w.score,
    mediaUrl: w.mediaUrl,
    participant: { name: w.user?.name, avatarUrl: w.user?.avatarUrl },
  }));
}

export { REGISTRATION_STATUS };
