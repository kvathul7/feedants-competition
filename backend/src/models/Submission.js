import mongoose from 'mongoose';

export const SUBMISSION_STATUS = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  DISQUALIFIED: 'disqualified',
  SCORED: 'scored',
};

const submissionSchema = new mongoose.Schema(
  {
    competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },

    mediaUrl: { type: String, required: true },
    caption: { type: String, maxlength: 500 },

    status: {
      type: String,
      enum: Object.values(SUBMISSION_STATUS),
      default: SUBMISSION_STATUS.SUBMITTED,
    },

    // Re-uploading before the deadline replaces the entry and bumps this.
    revision: { type: Number, default: 1 },
    submittedAt: { type: Date, default: () => new Date() },

    score: { type: Number, min: 0, max: 100, default: null },
    rank: { type: Number, min: 1, default: null },
    judgeNotes: { type: String, default: null },
  },
  { timestamps: true }
);

// One entry per participant per competition; re-upload mutates it in place.
submissionSchema.index({ competition: 1, user: 1 }, { unique: true });
// Leaderboard / results.
submissionSchema.index({ competition: 1, rank: 1 });

export const Submission = mongoose.model('Submission', submissionSchema);
