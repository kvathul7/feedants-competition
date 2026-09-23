import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * Localized text. The design ships an ENG / हिंदी toggle, so every user-facing
 * string served from the database is stored per-locale rather than as a scalar.
 * Stored as a subdocument (not a Map) so it is projectable and indexable.
 */
export const localizedStringSchema = new mongoose.Schema(
  {
    en: { type: String, required: true, trim: true },
    hi: { type: String, trim: true },
  },
  { _id: false }
);

/** Resolves a localized subdocument to a single string with fallback to default locale. */
export function resolveLocale(value, locale = env.defaultLocale) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  const obj = typeof value.toObject === 'function' ? value.toObject() : value;
  return obj[locale] || obj[env.defaultLocale] || obj.en || null;
}

/** Deep-resolves localized fields in arrays/objects. */
export function resolveDeep(value, locale) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, locale));
  if (typeof value !== 'object') return value;

  const obj = typeof value.toObject === 'function' ? value.toObject() : value;
  const keys = Object.keys(obj);
  const isLocalized = keys.length > 0 && keys.every((k) => env.supportedLocales.includes(k));
  if (isLocalized) return resolveLocale(obj, locale);

  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = resolveDeep(v, locale);
  return out;
}
