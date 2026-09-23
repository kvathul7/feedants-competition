import test from 'node:test';
import assert from 'node:assert/strict';
import { Competition, PHASE } from '../src/models/Competition.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { resolveViewerAction, ACTION, canRegister, canSubmit } from '../src/services/lifecycleService.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-15T12:00:00Z');
const at = (offsetDays) => new Date(now.getTime() + offsetDays * DAY);

/**
 * Builds an unsaved Competition document. These tests exercise pure domain
 * logic, so they need no database at all - which is the point of keeping the
 * state machine free of I/O.
 */
function competition({ dates, booked = 0, total = 20, status = 'published' }) {
  return new Competition({
    title: { en: 'T' },
    slug: 's',
    category: 'Dance',
    prizePoolPaise: 1000,
    entryFeePaise: 9900,
    rewards: [{ position: 1, amountPaise: 1000 }],
    capacity: { total, booked },
    dates,
    judge: '000000000000000000000000',
    content: { about: { en: 'a' } },
    status,
  });
}

const OPEN_NOW = {
  registrationOpensAt: at(-2),
  registrationClosesAt: at(2),
  submissionStartsAt: at(3),
  submissionEndsAt: at(10),
  resultAt: at(12),
};

test('anonymous visitor during open registration is offered Register', () => {
  const c = competition({ dates: OPEN_NOW });
  const r = resolveViewerAction({ competition: c, registration: null, submission: null, now });
  assert.equal(r.action, ACTION.REGISTER);
  assert.equal(r.enabled, true);
});

test('a full competition shows Sold Out instead of Register', () => {
  const c = competition({ dates: OPEN_NOW, booked: 20, total: 20 });
  const r = resolveViewerAction({ competition: c, registration: null, submission: null, now });
  assert.equal(r.action, ACTION.SOLD_OUT);
  assert.equal(r.enabled, false);
});

test('a live hold is asked to complete payment, even when the competition is full', () => {
  const c = competition({ dates: OPEN_NOW, booked: 20, total: 20 });
  const registration = { status: REGISTRATION_STATUS.HELD, holdExpiresAt: at(0.01) };
  const r = resolveViewerAction({ competition: c, registration, submission: null, now });
  assert.equal(r.action, ACTION.COMPLETE_PAYMENT);
  assert.equal(r.enabled, true);
});

test('a lapsed hold falls back to Register rather than Complete Payment', () => {
  const c = competition({ dates: OPEN_NOW });
  const registration = { status: REGISTRATION_STATUS.HELD, holdExpiresAt: at(-0.01) };
  const r = resolveViewerAction({ competition: c, registration, submission: null, now });
  assert.equal(r.action, ACTION.REGISTER);
});

test('overlapping windows: a confirmed participant can upload while registration is still open', () => {
  // The reference design has exactly this shape - submissions open before
  // registration closes. A linear phase model reports REGISTRATION_OPEN here
  // and wrongly locks the participant out of uploading.
  const c = competition({
    dates: {
      registrationOpensAt: at(-5),
      registrationClosesAt: at(3),   // still open
      submissionStartsAt: at(-1),    // already open
      submissionEndsAt: at(10),
      resultAt: at(12),
    },
  });

  assert.equal(c.phaseAt(now), PHASE.SUBMISSION_OPEN);
  assert.equal(canRegister({ competition: c, now }).ok, true, 'registration still open');
  assert.equal(canSubmit({ competition: c, now }).ok, true, 'submission also open');

  const registration = { status: REGISTRATION_STATUS.CONFIRMED };
  const r = resolveViewerAction({ competition: c, registration, submission: null, now });
  assert.equal(r.action, ACTION.UPLOAD_SUBMISSION);
});

test('a confirmed participant who already submitted is offered Edit', () => {
  const c = competition({
    dates: { ...OPEN_NOW, submissionStartsAt: at(-1), registrationClosesAt: at(-0.5) },
  });
  const r = resolveViewerAction({
    competition: c,
    registration: { status: REGISTRATION_STATUS.CONFIRMED },
    submission: { _id: 'x' },
    now,
  });
  assert.equal(r.action, ACTION.EDIT_SUBMISSION);
});

test('a participant who never submitted sees the missed state once the window closes', () => {
  const c = competition({
    dates: {
      registrationOpensAt: at(-20),
      registrationClosesAt: at(-15),
      submissionStartsAt: at(-14),
      submissionEndsAt: at(-2),
      resultAt: at(5),
    },
  });
  const r = resolveViewerAction({
    competition: c,
    registration: { status: REGISTRATION_STATUS.CONFIRMED },
    submission: null,
    now,
  });
  assert.equal(r.action, ACTION.MISSED_SUBMISSION);
  assert.equal(r.enabled, false);
});

test('results declared surfaces View Results for everyone', () => {
  const c = competition({
    dates: {
      registrationOpensAt: at(-30),
      registrationClosesAt: at(-25),
      submissionStartsAt: at(-24),
      submissionEndsAt: at(-10),
      resultAt: at(-2),
    },
  });
  assert.equal(c.phaseAt(now), PHASE.RESULTS_DECLARED);
  for (const registration of [null, { status: REGISTRATION_STATUS.CONFIRMED }]) {
    assert.equal(
      resolveViewerAction({ competition: c, registration, submission: null, now }).action,
      ACTION.VIEW_RESULTS
    );
  }
});

test('registration has not opened yet', () => {
  const c = competition({
    dates: {
      registrationOpensAt: at(2),
      registrationClosesAt: at(5),
      submissionStartsAt: at(6),
      submissionEndsAt: at(10),
      resultAt: at(12),
    },
  });
  const r = resolveViewerAction({ competition: c, registration: null, submission: null, now });
  assert.equal(r.action, ACTION.REGISTRATION_NOT_OPEN);
  assert.equal(canRegister({ competition: c, now }).code, 'REGISTRATION_NOT_OPEN');
});

test('a cancelled competition overrides every other state', () => {
  const c = competition({ dates: OPEN_NOW, status: 'cancelled' });
  const r = resolveViewerAction({
    competition: c,
    registration: { status: REGISTRATION_STATUS.CONFIRMED },
    submission: null,
    now,
  });
  assert.equal(r.action, ACTION.CANCELLED);
  assert.equal(canRegister({ competition: c, now }).code, 'COMPETITION_CANCELLED');
});

test('rewards that do not sum to the prize pool are rejected', () => {
  const c = competition({ dates: OPEN_NOW });
  c.rewards = [{ position: 1, amountPaise: 999 }]; // pool is 1000
  const err = c.validateSync();
  assert.ok(err, 'validation must fail');
});

test('duplicate reward positions are rejected', () => {
  const c = competition({ dates: OPEN_NOW });
  c.prizePoolPaise = 2000;
  c.rewards = [
    { position: 1, amountPaise: 1000 },
    { position: 1, amountPaise: 1000 },
  ];
  assert.ok(c.validateSync(), 'validation must fail');
});
