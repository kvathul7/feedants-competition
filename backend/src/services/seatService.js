import mongoose from 'mongoose';
import { Competition } from '../models/Competition.js';
import { Registration, REGISTRATION_STATUS } from '../models/Registration.js';
import { logger } from '../utils/logger.js';

/**
 * Seat accounting.
 *
 * The only safe way to allocate a finite resource across concurrent writers is
 * a conditional atomic update: the capacity check and the increment must be the
 * same operation. Read-then-write - even inside a transaction - lets two
 * requests both observe 19/20 and both write 20/20, overselling the last seat.
 *
 *   findOneAndUpdate(
 *     { _id, $expr: { $lt: ['$capacity.booked', '$capacity.total'] } },
 *     { $inc: { 'capacity.booked': 1 } }
 *   )
 *
 * MongoDB applies single-document updates atomically and re-evaluates the
 * predicate against the committed document, so exactly one of N racing callers
 * observes the final seat. A null return means "no seat", not "no competition".
 */

/**
 * Atomically claims one seat. Returns the updated competition, or null if full.
 * `session` is optional; when supplied the claim participates in a transaction.
 */
export async function claimSeat(competitionId, session = null) {
  return Competition.findOneAndUpdate(
    {
      _id: competitionId,
      status: 'published',
      $expr: { $lt: ['$capacity.booked', '$capacity.total'] },
    },
    { $inc: { 'capacity.booked': 1 } },
    { new: true, session }
  );
}

/**
 * Returns a seat to the pool. Guarded with $gt: 0 so a double-release - from a
 * retried webhook, say - can never drive the counter negative.
 */
export async function releaseSeat(competitionId, session = null) {
  return Competition.findOneAndUpdate(
    { _id: competitionId, 'capacity.booked': { $gt: 0 } },
    { $inc: { 'capacity.booked': -1 } },
    { new: true, session }
  );
}

/**
 * Expires lapsed holds for one competition and returns their seats.
 *
 * Called opportunistically on the registration path: if a user hits a full
 * competition, we sweep that competition first and let them retry, rather than
 * making them wait for the next background tick to see a seat that is already
 * free. Bounded by `limit` so a pathological backlog cannot stall a request.
 */
export async function sweepExpiredHolds(competitionId, { limit = 50, now = new Date() } = {}) {
  const filter = {
    status: REGISTRATION_STATUS.HELD,
    holdExpiresAt: { $lte: now },
    ...(competitionId ? { competition: competitionId } : {}),
  };

  const lapsed = await Registration.find(filter)
    .select('_id competition seatClaimed')
    .limit(limit)
    .lean();
  if (lapsed.length === 0) return { released: 0 };

  let released = 0;
  for (const reg of lapsed) {
    // Re-assert status AND seat ownership inside the update: a concurrent
    // payment may have confirmed this registration between our read and this
    // write (if the match fails, the payment won - we must not release its
    // seat), and a registration that never successfully claimed a seat must
    // not hand one back.
    const res = await Registration.updateOne(
      {
        _id: reg._id,
        status: REGISTRATION_STATUS.HELD,
        holdExpiresAt: { $lte: now },
        seatClaimed: true,
      },
      {
        $set: { status: REGISTRATION_STATUS.EXPIRED, holdExpiresAt: null, seatClaimed: false },
        $inc: { revision: 1 },
      }
    );
    if (res.modifiedCount === 1) {
      await releaseSeat(reg.competition);
      released += 1;
    } else {
      // Held, lapsed, but never owned a seat: just retire it.
      await Registration.updateOne(
        { _id: reg._id, status: REGISTRATION_STATUS.HELD, holdExpiresAt: { $lte: now }, seatClaimed: false },
        { $set: { status: REGISTRATION_STATUS.EXPIRED, holdExpiresAt: null }, $inc: { revision: 1 } }
      );
    }
  }

  if (released > 0) logger.debug(`Released ${released} expired seat hold(s)`);
  return { released };
}

/**
 * Recomputes capacity.booked from the registration collection.
 *
 * Compensating rollbacks and crash windows can in principle leave the
 * denormalised counter drifted from reality. Rather than trusting it forever,
 * this reconciler is the audit path - run it on a schedule in production and
 * alert on any non-zero drift.
 */
export async function reconcileCapacity(competitionId) {
  const now = new Date();
  const [agg] = await Registration.aggregate([
    {
      $match: {
        competition: new mongoose.Types.ObjectId(String(competitionId)),
        seatClaimed: true,
        $or: [
          { status: REGISTRATION_STATUS.CONFIRMED },
          { status: REGISTRATION_STATUS.HELD, holdExpiresAt: { $gt: now } },
        ],
      },
    },
    { $count: 'occupied' },
  ]);

  const occupied = agg?.occupied ?? 0;
  const competition = await Competition.findById(competitionId).select('capacity');
  if (!competition) return null;

  const drift = competition.capacity.booked - occupied;
  if (drift !== 0) {
    logger.warn(`Capacity drift on ${competitionId}: counter=${competition.capacity.booked} actual=${occupied}`);
    await Competition.updateOne({ _id: competitionId }, { $set: { 'capacity.booked': occupied } });
  }
  return { occupied, drift };
}

/** Background sweeper. Returns a stop function. */
export function startHoldSweeper({ intervalSeconds }) {
  const handle = setInterval(() => {
    sweepExpiredHolds(null, { limit: 200 }).catch((err) =>
      logger.error('Hold sweeper failed:', err.message)
    );
  }, intervalSeconds * 1000);
  handle.unref?.();
  logger.info(`Seat-hold sweeper running every ${intervalSeconds}s`);
  return () => clearInterval(handle);
}
