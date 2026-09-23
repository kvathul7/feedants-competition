import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Competition } from '../src/models/Competition.js';
import { Judge } from '../src/models/Judge.js';
import { User } from '../src/models/User.js';
import { Registration, REGISTRATION_STATUS } from '../src/models/Registration.js';
import { startRegistration } from '../src/services/registrationService.js';
import { reconcileCapacity } from '../src/services/seatService.js';

const DAY = 24 * 60 * 60 * 1000;

let judge;

test.before(async () => {
  await connectDatabase();
  judge = await Judge.create({ name: 'Test Judge', title: { en: 'Judge' } });
});

test.after(async () => {
  await disconnectDatabase();
});

async function makeCompetition({ total, entryFeePaise = 9900 }) {
  const now = Date.now();
  return Competition.create({
    title: { en: 'Race Competition' },
    slug: `race-${new mongoose.Types.ObjectId()}`,
    category: 'Dance',
    prizePoolPaise: 100000,
    entryFeePaise,
    rewards: [{ position: 1, amountPaise: 100000 }],
    capacity: { total, booked: 0 },
    dates: {
      registrationOpensAt: new Date(now - DAY),
      registrationClosesAt: new Date(now + DAY),
      submissionStartsAt: new Date(now + DAY),
      submissionEndsAt: new Date(now + 2 * DAY),
      resultAt: new Date(now + 3 * DAY),
    },
    judge: judge._id,
    content: { about: { en: 'about' } },
    status: 'published',
  });
}

const makeUsers = (n, tag) =>
  User.create(
    Array.from({ length: n }, (_, i) => ({ name: `U${i}`, email: `${tag}-${i}@race.test` }))
  );

test('N concurrent registrations on C seats never oversell', async () => {
  const SEATS = 20;
  const CONTENDERS = 100;

  const competition = await makeCompetition({ total: SEATS });
  const users = await makeUsers(CONTENDERS, 'burst');

  // Fire every request in the same tick - this is the actual race.
  const results = await Promise.allSettled(
    users.map((u) =>
      startRegistration({
        userId: u._id,
        competitionId: competition._id,
        idempotencyKey: `burst-${u._id}`,
      })
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const soldOut = results.filter(
    (r) => r.status === 'rejected' && r.reason.code === 'NO_SPOTS_LEFT'
  ).length;
  const unexpected = results.filter(
    (r) => r.status === 'rejected' && r.reason.code !== 'NO_SPOTS_LEFT'
  );

  assert.deepEqual(unexpected.map((u) => u.reason.message), [], 'no unexpected failures');
  assert.equal(succeeded, SEATS, `exactly ${SEATS} winners`);
  assert.equal(soldOut, CONTENDERS - SEATS, 'everyone else told sold out');

  const fresh = await Competition.findById(competition._id);
  assert.equal(fresh.capacity.booked, SEATS, 'counter matches seats');
  assert.equal(fresh.spotsLeft(), 0);

  // The counter is a denormalisation; verify it against the source of truth.
  const held = await Registration.countDocuments({
    competition: competition._id,
    status: { $in: [REGISTRATION_STATUS.HELD, REGISTRATION_STATUS.CONFIRMED] },
  });
  assert.equal(held, SEATS, 'registration documents agree with the counter');

  const audit = await reconcileCapacity(competition._id);
  assert.equal(audit.drift, 0, 'no capacity drift');
});

test('the same user racing themselves consumes exactly one seat', async () => {
  const competition = await makeCompetition({ total: 10 });
  const [user] = await makeUsers(1, 'double-tap');

  // A double-tapped Register button: same key, fired simultaneously.
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      startRegistration({
        userId: user._id,
        competitionId: competition._id,
        idempotencyKey: 'same-key-every-time',
      })
    )
  );

  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.ok(ok.length >= 1, 'at least one attempt succeeds');

  const fresh = await Competition.findById(competition._id);
  assert.equal(fresh.capacity.booked, 1, 'only one seat consumed');

  const regs = await Registration.countDocuments({ competition: competition._id });
  assert.equal(regs, 1, 'only one registration document exists');
});

test('a free competition confirms immediately without a payment order', async () => {
  const competition = await makeCompetition({ total: 5, entryFeePaise: 0 });
  const [user] = await makeUsers(1, 'free');

  const result = await startRegistration({
    userId: user._id,
    competitionId: competition._id,
    idempotencyKey: 'free-1',
  });

  assert.equal(result.registration.status, REGISTRATION_STATUS.CONFIRMED);
  assert.equal(result.payment, null);
  assert.equal(result.checkout, null);
});

test('capacity never goes negative when releases are replayed', async () => {
  const competition = await makeCompetition({ total: 3 });
  const users = await makeUsers(3, 'release');

  for (const u of users) {
    await startRegistration({
      userId: u._id,
      competitionId: competition._id,
      idempotencyKey: `rel-${u._id}`,
    });
  }

  const { releaseSeat } = await import('../src/services/seatService.js');
  // Ten releases against three seats - the guard must floor at zero.
  await Promise.all(Array.from({ length: 10 }, () => releaseSeat(competition._id)));

  const fresh = await Competition.findById(competition._id);
  assert.equal(fresh.capacity.booked, 0, 'floored at zero, never negative');
});
