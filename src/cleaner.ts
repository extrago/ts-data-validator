// =============================================================================
// src/cleaner.ts — Data Sanitization Logic
// =============================================================================
//
// RESPONSIBILITY OF THIS MODULE:
//   This module's ONLY job is to take a RAW row (which has already been
//   determined to be VALID by validator.ts) and transform it into a clean,
//   correctly-typed `ValidatedRecord`.
//
//   KEY DISTINCTION:
//     - validator.ts answers: "Is this data correct?"
//     - cleaner.ts answers:   "Now that we know it's correct, how do we
//                              shape it into a properly typed, clean object?"
//
//   By separating these concerns, we ensure that:
//     1. The validator is "pure" — it doesn't mutate anything, just checks.
//     2. The cleaner only ever receives data it KNOWS is valid, so it can
//        safely parse strings to numbers without defensive error handling.
//
// =============================================================================

import { RawCsvRow, ValidatedRecord } from './types';

// =============================================================================
// PUBLIC API: cleanRow
// =============================================================================
/**
 * Sanitizes a validated raw CSV row into a strongly-typed `ValidatedRecord`.
 *
 * This function is intentionally simple because it only receives rows that
 * have already passed all validation checks. Its responsibilities are:
 *
 *   1. TRIM: Remove leading/trailing whitespace from all string fields.
 *   2. PARSE: Convert string representations of numbers into actual `number`
 *      primitives so they can be used mathematically downstream.
 *   3. DEFAULT: Apply default values for any fields that are optional or
 *      might be empty but are still structurally valid.
 *   4. NORMALIZE: Standardize casing (e.g., email to lowercase).
 *
 * @param row - A raw CSV row that has been confirmed valid by `validateRow()`.
 * @returns A clean, strongly-typed `ValidatedRecord` object.
 *
 * CONCEPT — Why This Function Returns `ValidatedRecord` and Not `RawCsvRow`:
 *   This is "type narrowing" in action. We start with a `RawCsvRow` where
 *   everything is a `string`, and we produce a `ValidatedRecord` where
 *   numbers are actual `number` types. TypeScript enforces this contract —
 *   if we forget to parse `id` and try to return it as a string, the
 *   compiler will throw a type error immediately.
 */
export function cleanRow(row: RawCsvRow): ValidatedRecord {
  // -------------------------------------------------------------------------
  // STEP 1: Trim all string fields.
  // -------------------------------------------------------------------------
  // `String.prototype.trim()` removes whitespace (spaces, tabs, newlines)
  // from BOTH ends of a string. This handles common CSV data entry issues
  // where someone accidentally added a space (e.g., " john@example.com ").
  const trimmedName = row.name.trim();
  const trimmedEmail = row.email.trim();
  const trimmedCountry = row.country.trim();

  // -------------------------------------------------------------------------
  // STEP 2: Normalize string casing.
  // -------------------------------------------------------------------------
  // Emails should always be stored in lowercase. "User@Example.COM" and
  // "user@example.com" are the same mailbox per email RFC standards, but
  // a simple string comparison would treat them as different. Normalizing
  // to lowercase prevents inconsistencies in downstream systems.
  const normalizedEmail = trimmedEmail.toLowerCase();

  // -------------------------------------------------------------------------
  // STEP 3: Apply defaults for optional fields.
  // -------------------------------------------------------------------------
  // If `country` is an empty string after trimming, we assign a default
  // value. The `||` operator returns the right side if the left side is
  // "falsy" (which includes empty strings, 0, null, undefined, false).
  //
  // WHY USE `||` HERE INSTEAD OF `??` (nullish coalescing)?
  //   `??` only checks for null/undefined, NOT for empty strings.
  //   Since an empty string `""` is a valid result of `.trim()` and we
  //   want to replace it with a default, `||` is the right operator here.
  const countryWithDefault = trimmedCountry || 'Unknown';

  // -------------------------------------------------------------------------
  // STEP 4: Parse numeric fields.
  // -------------------------------------------------------------------------
  // We use `parseInt` for the ID (it must be a whole number) and
  // `parseFloat` for coordinates (they are decimal numbers).
  //
  // NOTE: We do NOT need to check for NaN here. The validator already
  // confirmed these strings are valid numbers. This is the benefit of
  // the validation-first approach — the cleaner can be simpler and
  // more direct.
  const parsedId = parseInt(row.id.trim(), 10);
  const parsedLat = parseFloat(row.latitude.trim());
  const parsedLon = parseFloat(row.longitude.trim());

  // -------------------------------------------------------------------------
  // STEP 5: Assemble and return the final clean record.
  // -------------------------------------------------------------------------
  // We return an object literal that satisfies the `ValidatedRecord`
  // interface. TypeScript will check this at compile time — if we're
  // missing a field or have the wrong type, it's a compile error, not
  // a runtime surprise.
  return {
    id: parsedId,
    name: trimmedName,
    email: normalizedEmail,
    latitude: parsedLat,
    longitude: parsedLon,
    country: countryWithDefault,
  };
}
