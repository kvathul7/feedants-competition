import mongoose from 'mongoose';
import { localizedStringSchema } from './localizedString.js';

/**
 * Judges are a separate collection rather than embedded: the same judge appears
 * across many competitions, and their bio/photo should update in one place.
 */
const judgeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    title: { type: localizedStringSchema, required: true },   // "Professional Kathak Dancer"
    experienceYears: { type: Number, min: 0 },
    photoUrl: { type: String },
    introVideoUrl: { type: String },
    bio: { type: localizedStringSchema },
  },
  { timestamps: true }
);

export const Judge = mongoose.model('Judge', judgeSchema);
