# Feedants — Competition Details (Full-Stack Module)

Technical assignment submission: the Competition Details screen built as a working
full-stack feature — React Native (Expo) + Node/Express + MongoDB — with all screen
content and every state served from the database.

No value on the screen is hardcoded. Prize pool, entry fee, seat counts, dates,
judge, rewards, previous winners, rules and the primary CTA all come from the API,
in the viewer's language, resolved against the server clock.

---

## Quick start

Two terminals. **No database installation required** — if `MONGODB_URI` is empty the
API boots a disposable in-memory MongoDB replica set and seeds it automatically.

```bash
# 1) API  ->  http://localhost:4000
cd backend
cp .env.example .env
npm install
npm run dev

# 2) App
cd mobile
npm install
npm start          # then press 'a' (Android), 'i' (iOS), or 'w' (web)
```

Sign in from the app with the seeded account **demo@feedants.test** (tap the CTA
while signed out and it signs you in). Then Register → pay on the mock sheet →
the screen flips to `Registered` and the CTA becomes `Upload Submission`.

### Pointing the app at the API

| Target | What to set |
|---|---|
| Android emulator | nothing — defaults to `http://10.0.2.2:4000` |
| iOS simulator / web | nothing — defaults to `http://localhost:4000` |
| Physical device | `EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:4000 npm start` |

### Using a real MongoDB

Set `MONGODB_URI` in `backend/.env` (Atlas or local), then `npm run seed` once.
A replica set is recommended but **not required** — see *Concurrency* below.

### Tests

```bash
cd backend && npm test      # 16 tests: concurrency + lifecycle state machine
```

---

## Environment variables

`backend/.env` (template in `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | *(empty)* | Empty ⇒ in-memory replica set. Set for Atlas/local. |
| `MONGODB_DB_NAME` | `feedants` | Database name |
| `PORT` | `4000` | API port |
| `JWT_SECRET` | dev value | Token signing secret — **change in production** |
| `SEAT_HOLD_SECONDS` | `600` | How long an unpaid seat stays reserved |
| `HOLD_SWEEP_INTERVAL_SECONDS` | `60` | Background sweeper cadence |
| `PAYMENT_PROVIDER` | `mock` | `mock` \| `razorpay` |
| `PAYMENT_WEBHOOK_SECRET` | dev value | HMAC secret for payment + webhook signatures |
| `RAZORPAY_KEY_ID` / `_SECRET` | *(empty)* | Only needed for the real adapter |
| `DEFAULT_LOCALE` / `SUPPORTED_LOCALES` | `en` / `en,hi` | i18n |

`mobile`: `EXPO_PUBLIC_API_URL` (optional, see table above).

---

## API

Base: `/api/v1`. Errors are uniform — `{ error: { code, message, details? }, requestId }` —
and clients branch on `code`, never on message text.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/dev-login` | Issues a JWT for a seeded user. Disabled when `NODE_ENV=production`. |
| `GET` | `/auth/me` | Current user |
| `GET` | `/competitions` | Paginated feed |
| `GET` | `/competitions/:idOrSlug` | **The whole screen in one call.** Optional auth. |
| `GET` | `/competitions/:id/winners` | 409 until results are declared |
| `POST` | `/competitions/:id/registrations` | Reserves a seat, opens a payment order. Idempotent. |
| `DELETE` | `/competitions/:id/registrations` | Cancel, returns the seat |
| `POST` | `/payments/confirm` | Signature-verified, replay-safe |
| `POST` | `/webhooks/payments` | Unauthenticated; HMAC over the raw body |
| `PUT` | `/competitions/:id/submission` | Upload / replace an entry |
| `GET`/`DELETE` | `/competitions/:id/submission` | Read / withdraw |
| `GET` | `/ops/competitions/:id/capacity-audit` | Recomputes the seat counter, reports drift |

`GET /competitions/:idOrSlug` returns `serverTime`, `phase`, `countdown`, `capacity`
and a `viewer` block containing the user's registration, submission, and the single
**`action`** the UI should render.

---

## Key technical decisions

### 1. Seats cannot be oversold

The whole screen turns on one finite resource: `19 spots left · 1 / 20 Booked`.

Allocation is a **conditional atomic update** — the capacity check and the increment
are the *same* operation:

```js
Competition.findOneAndUpdate(
  { _id, status: 'published', $expr: { $lt: ['$capacity.booked', '$capacity.total'] } },
  { $inc: { 'capacity.booked': 1 } }
)
```

Read-then-write — even inside a transaction — lets two requests both observe 19/20
and both write 20/20. A `null` return means *no seat*, and exactly one of N racing
callers gets the last one.

That alone is not sufficient. A **single user double-tapping Register** would take N
seats: the unique index collapses the N requests into one registration document, but
N seats are already gone. So the registration document is the serialisation point —
a request must first *win the right to occupy a seat* via an upsert guarded on
"not currently seat-occupying", and only the winner proceeds to claim one. Losers
collide on the unique index and resume the winner's attempt.

`tests/concurrency.test.js` asserts both: 100 simultaneous users on 20 seats produce
exactly 20 winners and 80 `NO_SPOTS_LEFT`, and 8 simultaneous requests from one user
consume exactly 1 seat.

**No transaction is used on this path, deliberately.** Every capacity write already
targets a single document atomically, and a `seatClaimed` flag makes the two-step
sequence recoverable. Wrapping the hottest document in the system in a transaction
would convert seat contention into a storm of write conflicts and retries — the
opposite of what "thousands of concurrent users" needs. The code therefore runs
correctly on a standalone `mongod`, not just a replica set.

### 2. Unpaid seats expire

A seat is *held*, not sold, until payment completes (`SEAT_HOLD_SECONDS`, default 10
min). Without this, anyone can exhaust a competition by starting checkouts and
walking away.

Holds are reclaimed two ways: a background sweeper, and **opportunistically on
demand** — a user hitting a full competition triggers a sweep of that competition and
retries, so they see a seat that is already free instead of waiting for the next tick.

### 3. The clock is the server's

Every response carries `serverTime`. The app computes the skew once and ticks against
`Date.now() + skew`, re-syncing on foreground (JS timers are throttled while
backgrounded). A device with a wrong clock — or a user setting it forward to reopen a
closed deadline — still sees the truth, and the server would reject the write anyway.

### 4. Registration and submission windows overlap

The provided design shows submissions opening **6 Aug** while registration runs to
**10 Aug** — four days where both are open. A linear `phase` derived from a chain of
`if`s reports `REGISTRATION_OPEN` there and locks paid participants out of uploading.

So windows are evaluated **independently** (`competition.windows(now)`); `phase` is
only a headline for the banner, and all authorisation goes through the windows.

### 5. The server decides the CTA

The bottom button renders whatever `viewer.action` says — one of 12 actions
(`register`, `complete_payment`, `upload_submission`, `edit_submission`,
`view_submission`, `view_results`, `sold_out`, `missed_submission`, …) with an
`enabled` flag. The client maps it to copy and a handler and nothing else.

Re-deriving those rules client-side would mean two implementations drifting apart,
and a button that offers what the API will reject. The resolver is a pure function,
exhaustively tested across the window × registration-state matrix.

### 6. Payments are idempotent end to end

- **Order creation** dedupes on a client `Idempotency-Key` — a retried request after
  a dropped response resolves to the same seat and same order.
- **Confirmation** verifies an HMAC-SHA256 signature in constant time and is
  replay-safe.
- **The webhook is the authoritative path.** The client callback can be lost (app
  killed mid-payment); the gateway calling us is what guarantees a paid user gets
  their seat. Signed over the **raw** body — re-serialising the parsed object changes
  key order and breaks verification — and idempotent on the provider event id.
- **Payment succeeding after the hold lapsed** is handled explicitly: try to reclaim
  a seat; if the competition has since filled, **auto-refund**. Never a silent
  capture, never an oversold competition.

The mock provider implements Razorpay's *actual* contract (order ids, `orderId|paymentId`
HMAC, raw-body webhook signatures), so swapping in the real SDK changes one method.

### 7. Money is integer paise

`₹99` is stored as `9900`. Float arithmetic drifts and payment reconciliation must be
exact. The model also **rejects rewards that do not sum to the prize pool** — the
design shows ₹1,500 and six rewards totalling ₹1,500; treating those as independent
fields invites them to drift.

### 8. Localisation is server-side

Every user-facing string on a document is stored as `{ en, hi }` and resolved per
request (`?locale=hi` / `Accept-Language`). The ENG/हिंदी toggle refetches. Only UI
chrome ships in the app — **adding a language does not require an app release**.

---

## Data model

| Collection | Purpose | Notable indexes |
|---|---|---|
| `competitions` | Content, money, capacity counter, lifecycle dates | `{status, dates.registrationClosesAt}` |
| `registrations` | One doc per (competition, user), for life | **unique** `{competition, user}`; `{status, holdExpiresAt}` |
| `payments` | Orders, provider ids, processed webhook events | **unique** `{idempotencyKey}`, `{providerOrderId}` |
| `submissions` | One entry per participant; re-upload mutates | **unique** `{competition, user}`; `{competition, rank}` |
| `users`, `judges` | Participants and reusable judge profiles | unique `{email}`, `{referralCode}` |

One registration document per (competition, user) — retrying after an expired hold
reuses it — which makes "am I registered?" a single-document read and double
registration *structurally* impossible rather than merely validated against.

`capacity.booked` is a denormalisation for O(1) reads. `reconcileCapacity()` audits it
against the registration collection and is exposed at
`/ops/competitions/:id/capacity-audit`; the tests assert zero drift.

---

## Edge cases handled

- Sold out, and sold out *while* the user is paying → reclaim or auto-refund
- Hold expiry mid-checkout (the payment sheet shows the live hold timer and disables on expiry)
- Double-tapped Register, and retries after a dropped response
- Duplicate / replayed payment confirmations and webhook deliveries
- Invalid payment signatures (constant-time compare)
- Registration closing while the screen is open → countdown hitting zero refetches
- Submission before payment confirms → rejected (mirrors the "paid participants only" disclaimer)
- Submission outside the window; re-upload replaces rather than duplicates
- Registered-but-never-submitted after the window closes
- Free (₹0) competitions skip the payment leg entirely
- Signed-out viewing — the screen renders fully, the CTA signs in first
- Expired/invalid token treated as signed-out, not an error
- Cancelled competitions override every other state
- Seat counter can never go negative (guarded `$inc`) or exceed capacity (validator)

---

## Assumptions

1. **Auth is out of scope.** A signed JWT with a dev-login endpoint stands in for real
   identity. Everything downstream depends only on `req.user`, so swapping in OTP or
   OAuth touches one handler. Dev-login is disabled when `NODE_ENV=production`.
2. **Payments are mocked with a real interface.** Razorpay test keys were not available;
   the adapter seam is real and the signature scheme is identical.
3. **Submissions are URLs, not uploads.** Real media ingestion means S3 presigned
   uploads + transcoding — infrastructure, not business logic, and not what this
   assignment is probing.
4. **Placeholder media.** Judge photo, winner thumbnails and video URLs point at
   placeholder services; play buttons are affordances, not a wired video player.
   Copy-link shows its confirmation state without touching the clipboard
   (that needs `expo-clipboard`). The graded behaviour - registration, payment,
   capacity, lifecycle, submission - is fully functional.
5. **Seeded dates are relative to *now***, not the literal August 2026 dates in the
   design, which are in the past and would render the screen in its results state with
   no countdown and no working Register flow. The primary competition is offset so the
   countdown reads ~`01d : 06h : 28m`, matching the design. Four more competitions are
   seeded in the other lifecycle states (sold out, submission open, results declared,
   not yet open, free entry).
6. **Judging is not modelled** beyond scores/ranks — the design shows no judging UI.
7. **Single screen, no navigator** — the assignment scopes one module. The screen drops
   into a stack unchanged.
8. Assets are placeholder URLs.

---

## What I would change for production

- **Seat counter contention.** One hot document per competition is the scaling ceiling.
  At very high concurrency I would shard the counter into N sub-counters claimed at
  random, or front it with a Redis `DECR` reservation backed by periodic reconciliation
  — the audit endpoint is already the hook for that.
- **Token storage.** The app keeps the JWT in memory. Production wants
  `expo-secure-store` (Keychain/Keystore) plus refresh-token rotation — AsyncStorage
  is plaintext and the wrong place for a credential.
- **Real payments and refunds.** Wire the Razorpay SDK, and make the auto-refund path
  issue an actual refund rather than marking the record.
- **The sweeper is in-process.** Fine for one instance; with N replicas it should be a
  single scheduled job (or leader-elected) so instances do not duplicate work.
- **Caching.** Competition content is read-heavy and changes rarely — split the cacheable
  content from the volatile capacity/viewer block and put the former behind a CDN or
  Redis with tag invalidation. Today the whole payload is `private, no-store`.
- **Realtime seat counts** via WebSocket/SSE instead of refetch-on-foreground, so
  `19 spots left` ticks down live.
- **Observability.** Structured JSON logs, request tracing, and alerting on capacity
  drift, refund rate, and hold-expiry rate.
- **Testing depth.** Add API-level integration tests and a load test that asserts the
  no-oversell invariant under sustained traffic, not just a burst.
- **Rate limiting** is in-process; behind multiple instances it needs a shared store.

---

## Project layout

```
backend/
  src/
    config/      env, database (auto in-memory replica set)
    models/      Competition, Registration, Payment, Submission, User, Judge
    services/    seat allocation, registration orchestration, lifecycle, payments
    controllers/ routes/ middleware/   HTTP layer, auth, validation, errors
    seed/        deterministic demo data across every lifecycle state
  tests/         concurrency + lifecycle state machine (16 tests)

mobile/
  src/
    api/         fetch client with timeouts and typed errors
    components/  primitives + one component per design section
    context/     auth + locale
    hooks/       useCompetition, useServerCountdown
    i18n/        UI chrome strings (content is localised server-side)
    screens/     CompetitionDetailsScreen
```
