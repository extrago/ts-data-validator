// =============================================================================
// src/types.ts — Centralized Type Definitions
// =============================================================================
//
// WHY A SEPARATE types.ts FILE?
//   In a well-structured project, types are the "contracts" that different
//   modules agree to honor. By placing all interfaces and types in one file:
//
//   1. DISCOVERABILITY: Any developer can open types.ts to understand the
//      entire data model of the application at a glance.
//   2. REUSABILITY: Both validator.ts and cleaner.ts can import from here
//      without creating circular dependencies.
//   3. SINGLE SOURCE OF TRUTH: If the CSV schema changes (e.g., a new column
//      is added), you update the type in ONE place, and TypeScript will
//      immediately show you every place in the code that needs to be updated.
//
// =============================================================================

// -----------------------------------------------------------------------------
// INTERFACE: RawCsvRow
// -----------------------------------------------------------------------------
// CONCEPT — What is an Interface?
//   An interface in TypeScript defines the "shape" of an object — which
//   properties it has and what their types are. It's a compile-time-only
//   construct; it doesn't exist in the compiled JavaScript.
//
//   Think of it as a blueprint. When csv-parser reads a row from the file,
//   it returns a plain object. We use this interface to tell TypeScript:
//   "trust me, this object will have these specific string properties".
//
// WHY ARE ALL FIELDS `string`?
//   CSV files are plain text. When csv-parser reads a row, EVERY field
//   comes in as a string — even numbers. It's the validator's job to
//   parse and convert them to the correct types (number, etc.) before
//   we can do meaningful validation. This interface represents raw,
//   unprocessed data straight from the file.
// -----------------------------------------------------------------------------
export interface RawCsvRow {
  id: string;
  name: string;
  email: string;
  latitude: string;
  longitude: string;
  country: string;
}

// -----------------------------------------------------------------------------
// INTERFACE: ValidatedRecord
// -----------------------------------------------------------------------------
// This interface represents a row AFTER it has been parsed, validated, and
// confirmed to be correct. Notice how the types are now more specific:
//   - `id` is a `number` (not a string) because we've confirmed it's numeric.
//   - `latitude` and `longitude` are `number` because we've parsed them.
//   - All string fields have been sanitized (trimmed of whitespace).
//
// This "type narrowing" pattern — going from a loose type (RawCsvRow) to
// a strict type (ValidatedRecord) — is a core TypeScript best practice.
// It enforces that data is only used in its final form after being processed.
// -----------------------------------------------------------------------------
export interface ValidatedRecord {
  id: number;
  name: string;
  email: string;
  latitude: number;
  longitude: number;
  country: string;
}

// -----------------------------------------------------------------------------
// INTERFACE: InvalidRecord
// -----------------------------------------------------------------------------
// When a row fails validation, we don't just throw it away. We capture it
// along with a human-readable `validationError` field explaining WHY it
// failed. This record will be written to the `invalid_records.csv` output.
//
// NOTE THE DESIGN CHOICE:
//   We extend RawCsvRow instead of ValidatedRecord because an invalid record
//   might have un-parseable fields. We keep everything as strings and add
//   the error message. This is safer than trying to force bad data into
//   typed numeric fields.
// -----------------------------------------------------------------------------
export interface InvalidRecord extends RawCsvRow {
  // The reason this record failed validation.
  // It's always a string because it's a human-readable message.
  validationError: string;
}

// -----------------------------------------------------------------------------
// INTERFACE: ProcessingResult
// -----------------------------------------------------------------------------
// This is the return type of the main processing pipeline. A function that
// returns this type is making a clear contract: "I will give you back two
// arrays — one of valid records and one of invalid records."
//
// Using a well-named return type interface is better than returning a
// plain tuple [ValidatedRecord[], InvalidRecord[]] because:
//   1. It's self-documenting — the property names explain what each array is.
//   2. It's extensible — you can add a `processingTimeMs` field later without
//      breaking existing code that destructures the result.
// -----------------------------------------------------------------------------
export interface ProcessingResult {
  validRecords: ValidatedRecord[];
  invalidRecords: InvalidRecord[];
}

// -----------------------------------------------------------------------------
// TYPE ALIAS: ValidationError
// -----------------------------------------------------------------------------
// CONCEPT — Type Alias vs Interface:
//   - `interface` is best for defining the shape of OBJECTS.
//   - `type` alias is best for unions, primitives, or complex compositions.
//
// Here, `ValidationError` is either a string message (a specific error was
// found) or `null` (meaning no error — the field is valid). This union type
// precisely models the two possible outcomes of a validation check.
//
// WHY NOT JUST RETURN `boolean`?
//   A boolean only tells you IF something failed. By returning the error
//   message itself (or null), the validator is self-describing — the caller
//   knows immediately what went wrong without needing a separate lookup.
// -----------------------------------------------------------------------------
export type ValidationError = string | null;
