import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { Judge } from '../models/Judge.js';
import { Competition } from '../models/Competition.js';
import { Registration, REGISTRATION_STATUS } from '../models/Registration.js';
import { Submission } from '../models/Submission.js';
import { Payment } from '../models/Payment.js';
import { logger } from '../utils/logger.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rupees = (r) => Math.round(r * 100); // -> paise

/**
 * Dates are seeded RELATIVE TO NOW rather than copied literally from the
 * design (which shows August 2026). A fixed past date would render the screen
 * in its results state and make the countdown, the Register CTA and the whole
 * booking flow undemonstrable. The primary competition is offset so the
 * countdown reads ~01d:06h:28m - matching the design - whenever it is run.
 */
export async function runSeed({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => logger.info(...a);
  const now = Date.now();

  await Promise.all([
    User.deleteMany({}),
    Judge.deleteMany({}),
    Competition.deleteMany({}),
    Registration.deleteMany({}),
    Submission.deleteMany({}),
    Payment.deleteMany({}),
  ]);

  // ---- users ---------------------------------------------------------------
  const [demo, alreadyIn, participant, ...crowd] = await User.create([
    { name: 'Athul K V', email: 'demo@feedants.test', locale: 'en', avatarUrl: 'https://i.pravatar.cc/150?img=12' },
    { name: 'Priya Nair', email: 'priya@feedants.test', locale: 'en', avatarUrl: 'https://i.pravatar.cc/150?img=45' },
    { name: 'Rahul Menon', email: 'rahul@feedants.test', locale: 'hi', avatarUrl: 'https://i.pravatar.cc/150?img=33' },
    ...Array.from({ length: 12 }, (_, i) => ({
      name: `Participant ${i + 1}`,
      email: `p${i + 1}@feedants.test`,
    })),
  ]);

  // ---- judge ---------------------------------------------------------------
  const judge = await Judge.create({
    name: 'Manju Dubey',
    title: { en: 'Professional Kathak Dancer', hi: 'पेशेवर कथक नृत्यांगना' },
    experienceYears: 12,
    photoUrl: 'https://i.pravatar.cc/300?img=47',
    introVideoUrl: 'https://cdn.feedants.test/judges/manju-intro.mp4',
    bio: {
      en: 'Manju has trained over 400 students and judged national-level classical dance competitions for a decade.',
      hi: 'मंजू ने 400 से अधिक छात्रों को प्रशिक्षित किया है और एक दशक तक राष्ट्रीय स्तर की शास्त्रीय नृत्य प्रतियोगिताओं का निर्णय किया है।',
    },
  });

  const previousWinners = [
    { name: 'Riya Shah', position: 1, thumbnailUrl: 'https://picsum.photos/seed/riya/200/260', videoUrl: 'https://cdn.feedants.test/w/riya.mp4', edition: 'Jul 2026' },
    { name: 'Aarav Mehta', position: 1, thumbnailUrl: 'https://picsum.photos/seed/aarav/200/260', videoUrl: 'https://cdn.feedants.test/w/aarav.mp4', edition: 'Jul 2026' },
    { name: 'Neha Verma', position: 2, thumbnailUrl: 'https://picsum.photos/seed/neha/200/260', videoUrl: 'https://cdn.feedants.test/w/neha.mp4', edition: 'Jul 2026' },
    { name: 'Ishita Chopra', position: 3, thumbnailUrl: 'https://picsum.photos/seed/ishita/200/260', videoUrl: 'https://cdn.feedants.test/w/ishita.mp4', edition: 'Jul 2026' },
  ];

  // Sums to exactly 1500 - the model rejects rewards that do not match the pool.
  const rewards = [
    { position: 1, amountPaise: rupees(550), label: { en: '1st Winner', hi: 'प्रथम विजेता' } },
    { position: 2, amountPaise: rupees(300), label: { en: '2nd Winner', hi: 'द्वितीय विजेता' } },
    { position: 3, amountPaise: rupees(240), label: { en: '3rd Winner', hi: 'तृतीय विजेता' } },
    { position: 4, amountPaise: rupees(200), label: { en: '4th Winner', hi: 'चतुर्थ विजेता' } },
    { position: 5, amountPaise: rupees(130), label: { en: '5th Winner', hi: 'पंचम विजेता' } },
    { position: 6, amountPaise: rupees(80), label: { en: '6th Winner', hi: 'षष्ठ विजेता' } },
  ];

  const content = {
    about: {
      en: 'This is an online classical dance competition open for all age groups. Participate from anywhere and showcase your talent. Express your passion through traditional dance.',
      hi: 'यह एक ऑनलाइन शास्त्रीय नृत्य प्रतियोगिता है जो सभी आयु वर्ग के लिए खुली है। कहीं से भी भाग लें और अपनी प्रतिभा दिखाएं।',
    },
    judgingParameters: [
      { en: 'Technique and footwork precision', hi: 'तकनीक और पदचाप की सटीकता' },
      { en: 'Expression and abhinaya', hi: 'भाव और अभिनय' },
      { en: 'Rhythm and timing with the composition', hi: 'लय और ताल' },
      { en: 'Costume and overall presentation', hi: 'वेशभूषा और प्रस्तुति' },
    ],
    rulesAndEligibility: [
      { en: 'Open to all age groups across India.', hi: 'भारत भर में सभी आयु वर्ग के लिए खुला।' },
      { en: 'Entry must be an original solo classical performance.', hi: 'प्रविष्टि मौलिक एकल शास्त्रीय प्रस्तुति होनी चाहिए।' },
      { en: 'Video must be 2 to 5 minutes long, shot in landscape.', hi: 'वीडियो 2 से 5 मिनट का होना चाहिए।' },
      { en: 'Only one submission per participant; re-uploads replace the previous entry.', hi: 'प्रति प्रतिभागी केवल एक प्रविष्टि।' },
      { en: 'The judge decision is final and binding.', hi: 'निर्णायक का निर्णय अंतिम होगा।' },
    ],
  };

  const baseCompetition = {
    category: 'Dance',
    tags: [{ en: 'Dance', hi: 'नृत्य' }, { en: 'Multi-Win', hi: 'मल्टी-विन' }],
    multiWin: true,
    certificateOnWin: true,
    prizePoolPaise: rupees(1500),
    entryFeePaise: rupees(99),
    currency: 'INR',
    rewards,
    judge: judge._id,
    content,
    disclaimer: {
      en: 'Only contributions from paid participants will be considered for judging.',
      hi: 'निर्णय के लिए केवल भुगतान किए गए प्रतिभागियों की प्रविष्टियाँ मानी जाएंगी।',
    },
    prizeMoneyVideoUrl: 'https://cdn.feedants.test/help/prize-money.mp4',
    refundPolicyUrl: 'https://feedants.com/refund-policy',
    previousWinners,
    bannerUrl: 'https://picsum.photos/seed/classical/800/400',
    status: 'published',
  };

  // ---- 1. The design screen: registration open, 1/20 booked ----------------
  const main = await Competition.create({
    ...baseCompetition,
    title: { en: 'Feedants Classical Dance', hi: 'फीडेंट्स शास्त्रीय नृत्य' },
    slug: 'feedants-classical-dance',
    capacity: { total: 20, booked: 0 },
    dates: {
      registrationOpensAt: new Date(now - 3 * DAY),
      // Produces the 01d:06h:28m countdown from the design.
      registrationClosesAt: new Date(now + DAY + 6 * HOUR + 28 * MINUTE + 32 * 1000),
      submissionStartsAt: new Date(now - 2 * DAY), // overlaps registration, as in the design
      submissionEndsAt: new Date(now + 20 * DAY),
      resultAt: new Date(now + 23 * DAY),
    },
  });

  // One confirmed participant so the screen reads "1 / 20 Booked, 19 spots left".
  await confirmUser(main, alreadyIn);

  // ---- 2. Sold out ---------------------------------------------------------
  const soldOut = await Competition.create({
    ...baseCompetition,
    title: { en: 'Feedants Semi-Classical Solo', hi: 'फीडेंट्स सेमी-क्लासिकल सोलो' },
    slug: 'feedants-semi-classical-solo',
    capacity: { total: 5, booked: 0 },
    dates: {
      registrationOpensAt: new Date(now - 2 * DAY),
      registrationClosesAt: new Date(now + 2 * DAY),
      submissionStartsAt: new Date(now + 2 * DAY),
      submissionEndsAt: new Date(now + 10 * DAY),
      resultAt: new Date(now + 12 * DAY),
    },
  });
  for (const u of crowd.slice(0, 5)) await confirmUser(soldOut, u);

  // ---- 3. Demo user already registered, submission window open -------------
  const submitting = await Competition.create({
    ...baseCompetition,
    title: { en: 'Feedants Folk Dance Challenge', hi: 'फीडेंट्स लोक नृत्य चुनौती' },
    slug: 'feedants-folk-dance-challenge',
    capacity: { total: 30, booked: 0 },
    dates: {
      registrationOpensAt: new Date(now - 10 * DAY),
      registrationClosesAt: new Date(now - DAY),
      submissionStartsAt: new Date(now - 12 * HOUR),
      submissionEndsAt: new Date(now + 5 * DAY),
      resultAt: new Date(now + 7 * DAY),
    },
  });
  await confirmUser(submitting, demo);
  await confirmUser(submitting, participant);

  // ---- 4. Results declared -------------------------------------------------
  const finished = await Competition.create({
    ...baseCompetition,
    title: { en: 'Feedants Bharatanatyam Cup', hi: 'फीडेंट्स भरतनाट्यम कप' },
    slug: 'feedants-bharatanatyam-cup',
    capacity: { total: 20, booked: 0 },
    dates: {
      registrationOpensAt: new Date(now - 40 * DAY),
      registrationClosesAt: new Date(now - 30 * DAY),
      submissionStartsAt: new Date(now - 29 * DAY),
      submissionEndsAt: new Date(now - 10 * DAY),
      resultAt: new Date(now - 5 * DAY),
    },
  });
  const winners = [demo, participant, ...crowd.slice(0, 2)];
  for (const [i, u] of winners.entries()) {
    const reg = await confirmUser(finished, u);
    await Submission.create({
      competition: finished._id,
      user: u._id,
      registration: reg._id,
      mediaUrl: `https://cdn.feedants.test/entries/${u._id}.mp4`,
      status: 'scored',
      score: 95 - i * 7,
      rank: i + 1,
      submittedAt: new Date(now - 12 * DAY),
    });
  }

  // ---- 5. Not yet open -----------------------------------------------------
  await Competition.create({
    ...baseCompetition,
    title: { en: 'Feedants Kathak Championship', hi: 'फीडेंट्स कथक चैंपियनशिप' },
    slug: 'feedants-kathak-championship',
    capacity: { total: 50, booked: 0 },
    entryFeePaise: 0, // free entry: exercises the no-payment registration path
    dates: {
      registrationOpensAt: new Date(now + 3 * DAY),
      registrationClosesAt: new Date(now + 15 * DAY),
      submissionStartsAt: new Date(now + 15 * DAY),
      submissionEndsAt: new Date(now + 25 * DAY),
      resultAt: new Date(now + 28 * DAY),
    },
  });

  log('--------------------------------------------------------------');
  log('Seed complete.');
  log(`  Primary competition : ${main._id}  (/api/v1/competitions/feedants-classical-dance)`);
  log(`  Sold out            : ${soldOut.slug}`);
  log(`  Submission open     : ${submitting.slug}`);
  log(`  Results declared    : ${finished.slug}`);
  log('  Sign in with  demo@feedants.test  (POST /api/v1/auth/dev-login)');
  log('--------------------------------------------------------------');

  return { main, demo };
}

/** Creates a confirmed registration and keeps the seat counter in step. */
async function confirmUser(competition, user) {
  const registration = await Registration.create({
    competition: competition._id,
    user: user._id,
    status: REGISTRATION_STATUS.CONFIRMED,
    confirmedAt: new Date(),
    amountPaidPaise: competition.entryFeePaise,
    revision: 1,
  });
  await Competition.updateOne({ _id: competition._id }, { $inc: { 'capacity.booked': 1 } });
  return registration;
}

// Direct invocation: `npm run seed`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  connectDatabase()
    .then(() => runSeed())
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Seed failed:', err);
      process.exit(1);
    });
}
