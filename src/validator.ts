// =============================================================================
// src/validator.ts — Data Validation Logic
// =============================================================================
//
// RESPONSIBILITY OF THIS MODULE:
//   This module's ONLY job is to answer the question: "Is this data correct?"
//   It does NOT modify data (that's the cleaner's job). It does NOT read or
//   write files (that's the main pipeline's job).
//
//   This "Single Responsibility Principle" (SRP) is a key software engineering
//   concept. Keeping validation logic isolated here means:
//     - It's easy to unit test each rule independently.
//     - You can change a rule without risking breaking file I/O logic.
//     - A new developer can find and understand all validation rules fast.
//
// EXPORTS:
//   - `validateRow()`: The primary function that orchestrates all checks
//     and returns the first error found for a given row.
//   - Individual check functions (exported for testability).
//
// =============================================================================

import { RawCsvRow, ValidationError } from './types';

// We use a Set to track seen IDs across all rows processed in a single run.
//
// WHY A SET INSTEAD OF AN ARRAY?
//   A Set stores unique values. Checking if a value exists in a Set
//   is O(1) — constant time — regardless of how many items it holds.
//   Checking an Array with `.includes()` is O(n) — it gets slower as
//   the array grows. For large CSV files, this difference is significant.
//
// WHY IS IT MODULE-LEVEL (outside any function)?
//   We need this state to PERSIST across multiple calls to validateRow().
//   If it were inside validateRow(), it would reset on every call and
//   we could never detect duplicate IDs.
const seenIds = new Set<number>();

// =============================================================================
// PUBLIC API: validateRow
// =============================================================================
/**
 * Orchestrates all validation checks for a single CSV row.
 *
 * This function runs each individual check and returns as soon as the
 * FIRST error is found (short-circuit evaluation). This is an intentional
 * design choice: we report one clear error per row rather than overwhelming
 * the user with multiple errors for the same bad record.
 *
 * @param row - A raw, unprocessed row object from csv-parser. All fields
 *              are strings at this stage, as read directly from the file.
 * @param rowNumber - The 1-based line number in the CSV, used for logging.
 * @returns `null` if the row is valid, or an error message string if not.
 *
 * CONCEPT — Function Signature with Return Type:
 *   The `: ValidationError` after the parameter list is an EXPLICIT RETURN
 *   TYPE ANNOTATION. TypeScript could infer this, but being explicit here
 *   documents the contract of this function and prevents future mistakes
 *   where someone accidentally adds a code path that returns something else.
 */
export function validateRow(row: RawCsvRow, rowNumber: number): ValidationError {
  // Run each check in order of specificity. Each check function returns
  // either null (pass) or a descriptive error string (fail).
  // The `??` (nullish coalescing) operator moves to the next check only
  // if the previous one returned null.

  const idError = validateId(row.id);
  if (idError !== null) {
    console.log(`  [WARN] Row ${rowNumber}: ID validation failed — ${idError}`);
    return idError;
  }

  const emailError = validateEmail(row.email);
  if (emailError !== null) {
    console.log(`  [WARN] Row ${rowNumber}: Email validation failed — ${emailError}`);
    return emailError;
  }

  const coordError = validateCoordinates(row.latitude, row.longitude);
  if (coordError !== null) {
    console.log(`  [WARN] Row ${rowNumber}: Coordinate validation failed — ${coordError}`);
    return coordError;
  }

  // All checks passed — return null to signal a valid record.
  return null;
}

// =============================================================================
// INTERNAL HELPERS: Individual Validation Rules
// =============================================================================
// These are exported so they can be independently tested in a test suite
// (e.g., Jest), but they are considered "internal" by convention.

/**
 * Validates the `id` field.
 *
 * Rules:
 *   1. Must be parseable as an integer (not NaN).
 *   2. Must be a positive integer (> 0).
 *   3. Must be unique across all rows processed in this run.
 *
 * @param idStr - The raw string value from the CSV `id` column.
 * @returns An error string if invalid, or null if valid.
 */
export function validateId(idStr: string): ValidationError {
  // `parseInt` with radix 10 is safer than `Number()` for integer parsing.
  // `Number("  ")` returns 0, which would be a false positive.
  // `parseInt("  ", 10)` correctly returns NaN.
  const id = parseInt(idStr.trim(), 10);

  // `isNaN()` checks if the parsed value is Not-a-Number.
  // This handles cases like empty strings, "abc", "1.5a", etc.
  if (isNaN(id)) {
    return `ID "${idStr}" is not a valid integer.`;
  }

  if (id <= 0) {
    return `ID "${id}" must be a positive integer (greater than 0).`;
  }

  // Check for duplicates using our module-level Set.
  if (seenIds.has(id)) {
    return `ID "${id}" is a duplicate. IDs must be unique.`;
  }

  // Only register the ID as "seen" if it passes all other checks.
  // This prevents a bad ID (e.g., -1) from "poisoning" the seenIds set.
  seenIds.add(id);

  return null; // Valid!
}

/**
 * Validates the `email` field.
 *
 * WHY NOT USE A COMPLEX REGEX?
 *   Full RFC 5321 email validation via regex is extremely complex and
 *   brittle. For most production use cases, a simple structural check
 *   (has an "@" and a domain with a dot) is a pragmatic balance between
 *   correctness and maintainability. The truly authoritative method is
 *   to send a confirmation email.
 *
 * @param email - The raw string value from the CSV `email` column.
 * @returns An error string if invalid, or null if valid.
 */
export function validateEmail(email: string): ValidationError {
  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return 'Email field is empty.';
  }

  // A simple but effective structural check:
  // 1. Must contain exactly one "@" symbol.
  // 2. The domain part (after "@") must contain at least one ".".
  // 3. There must be characters before "@" (local part) and after the last ".".
  const parts = trimmed.split('@');

  if (parts.length !== 2) {
    return `Email "${trimmed}" must contain exactly one "@" symbol.`;
  }

  const [localPart, domain] = parts;

  if (localPart.length === 0) {
    return `Email "${trimmed}" has an empty local part (before "@").`;
  }

  if (!domain.includes('.')) {
    return `Email "${trimmed}" has an invalid domain (missing ".").`;
  }

  const domainParts = domain.split('.');
  // The last segment (TLD like "com", "org") must not be empty.
  if (domainParts[domainParts.length - 1].length === 0) {
    return `Email "${trimmed}" has a malformed domain (ends with ".").`;
  }

  return null; // Valid!
}

/**
 * Validates the `latitude` and `longitude` fields.
 *
 * Rules:
 *   - Latitude must be a number between -90 and 90 (inclusive).
 *   - Longitude must be a number between -180 and 180 (inclusive).
 *
 * WHY USE `parseFloat` HERE?
 *   Geographical coordinates are decimal numbers (e.g., 48.8584° N).
 *   `parseInt` would truncate the decimal part and could cause valid
 *   coordinates to be misclassified, so `parseFloat` is the correct choice.
 *
 * @param latStr - The raw string value from the CSV `latitude` column.
 * @param lonStr - The raw string value from the CSV `longitude` column.
 * @returns An error string if invalid, or null if valid.
 */
export function validateCoordinates(latStr: string, lonStr: string): ValidationError {
  const lat = parseFloat(latStr.trim());
  const lon = parseFloat(lonStr.trim());

  if (isNaN(lat)) {
    return `Latitude "${latStr}" is not a valid number.`;
  }

  if (isNaN(lon)) {
    return `Longitude "${lonStr}" is not a valid number.`;
  }

  // Earth's coordinate bounds: Latitude [-90, 90], Longitude [-180, 180].
  if (lat < -90 || lat > 90) {
    return `Latitude "${lat}" is out of bounds. Must be between -90 and 90.`;
  }

  if (lon < -180 || lon > 180) {
    return `Longitude "${lon}" is out of bounds. Must be between -180 and 180.`;
  }

  return null; // Valid!
}

/**
 * Resets the internal `seenIds` Set.
 *
 * WHY DOES THIS FUNCTION EXIST?
 *   This is critical for TESTABILITY. In a test suite, you might run the
 *   validator multiple times in the same process. Without a reset function,
 *   IDs from test #1 would still be in the `seenIds` set when test #2 runs,
 *   causing false "duplicate ID" failures. Exposing a reset function is a
 *   clean pattern for managing module-level state in tests.
 */
export function resetValidatorState(): void {
  seenIds.clear();
}
