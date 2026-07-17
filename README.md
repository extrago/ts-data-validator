<div align="center">

# TypeScript Data Validator & Cleaner

**A production-ready CLI tool that streams, validates, and cleans raw CSV data — handling corrupt records gracefully, at any scale.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![CLI](https://img.shields.io/badge/Interface-CLI-black?style=for-the-badge&logo=gnometerminal&logoColor=white)](https://en.wikipedia.org/wiki/Command-line_interface)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Strict Mode](https://img.shields.io/badge/TypeScript-strict%20mode-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/tsconfig#strict)

</div>

---

## Overview

`data-validator-cli` is a modular, streaming CLI pipeline that ingests raw CSV files, applies a configurable set of validation rules, sanitizes and type-narrows clean records, and routes invalid rows to a dedicated report file — all without ever crashing the pipeline.

Built as a demonstration of **production TypeScript engineering**, the project prioritizes strict type safety, memory-efficient I/O, and a clean separation of concerns across its modules.

---

## Key Technical Highlights

### Zero `any` · Full Strict TypeScript
The project runs under `"strict": true` in `tsconfig.json`, which activates the complete suite of strict checks — `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, and more. No escape hatches. Every variable, parameter, and return value is explicitly and accurately typed.

### Type Narrowing — From Raw Data to Typed Domain Objects
All CSV rows enter the pipeline as `RawCsvRow` — a flat interface where **every field is a `string`**, because CSV files are plain text. Only after passing validation does a row get transformed by `cleaner.ts` into a `ValidatedRecord`, where `id`, `latitude`, and `longitude` are proper `number` primitives. This two-stage type progression is enforced by the compiler, making it impossible to accidentally use raw string data as if it were a parsed number.

```
RawCsvRow  { id: string, latitude: string, ... }
    │
    ▼  validator.ts + cleaner.ts
    │
ValidatedRecord  { id: number, latitude: number, ... }
```

### O(1) Duplicate Detection with `Set<number>`
Unique ID enforcement uses a module-scoped `Set<number>` rather than an array. Membership checks on a `Set` are **O(1) constant time**, compared to O(n) for `Array.prototype.includes()`. At scale — millions of rows — this is the difference between a tool that finishes in seconds and one that crawls.

### Memory-Efficient Streaming I/O
The input file is never loaded into memory. `fs.createReadStream()` opens the file as a **Readable Stream**, piped through `csv-parser` which emits one row object per `'data'` event. The entire stream is wrapped in a `Promise` to interoperate cleanly with `async/await`. Output files are written the same way using `fast-csv`'s Writable Stream, ensuring a flat, predictable memory footprint regardless of file size.

### Graceful Error Handling — No Row Crashes the Pipeline
Invalid rows are intercepted at the validation stage. They are collected into an `InvalidRecord[]` array — which extends `RawCsvRow` with a `validationError: string` field — and written to `invalid_records.csv` at the end of the run. The pipeline **never throws on bad data**. A top-level `.catch()` on the `main()` Promise guards against genuine I/O failures, exiting with code `1` so that CI/CD systems can detect a failed run.

### Generic, Reusable `writeCsv<T>()` Utility
A single generic function `writeCsv<T extends object>(records: T[], filePath: string)` handles writing both output files. TypeScript's generics eliminate code duplication without any casting or loss of type information — the compiler verifies the shape of every record at the call site.

---

## Project Architecture

```
data-validator-cli/
│
├── data/
│   ├── sample_input.csv        # Input — 15 rows with deliberate errors for testing
│   ├── cleaned_data.csv        # Output — valid, sanitized, typed records
│   └── invalid_records.csv     # Output — rejected rows + validationError column
│
├── src/
│   ├── index.ts                # Pipeline orchestrator: stream → validate → clean → write
│   ├── types.ts                # All interfaces & type aliases (single source of truth)
│   ├── validator.ts            # Pure validation logic: ID, email, coordinates
│   └── cleaner.ts              # Sanitization: trim, normalize, parse, defaults
│
├── package.json
├── tsconfig.json               # strict: true + all compiler options documented
└── README.md
```

**Module responsibilities are strictly separated:**

| Module | Answers the question |
|---|---|
| `types.ts` | What does the data look like? |
| `validator.ts` | Is the data correct? |
| `cleaner.ts` | How do we shape valid data into its final type? |
| `index.ts` | In what order does everything run? |

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher

### Installation

```bash
git clone https://github.com/your-username/data-validator-cli.git
cd data-validator-cli
npm install
```

### Run the Tool

Execute the full validation pipeline against `data/sample_input.csv`:

```bash
npm run dev
```

> This uses `ts-node` to run TypeScript directly — no build step required for development.

To compile first and run the JavaScript output:

```bash
npm run build
npm run start
```

### CI Type Check (No Emit)

Validate the entire codebase for type errors without producing any output files — ideal for CI/CD pipelines:

```bash
npx tsc --noEmit
```

A clean exit (code `0`) confirms zero type errors across the project.

---

## Data Flow

```
┌─────────────────────────┐
│     sample_input.csv    │  ← Raw CSV file (strings only)
└────────────┬────────────┘
             │  fs.createReadStream() + csv-parser
             ▼
┌─────────────────────────┐
│      Stream Reader      │  ← Emits one RawCsvRow per 'data' event
└────────────┬────────────┘
             │  Row-by-row, in memory
             ▼
┌─────────────────────────┐
│   Validator & Cleaner   │  ← Checks rules; type-narrows valid rows
└────────┬────────┬───────┘
         │        │
         ▼        ▼
┌──────────────┐  ┌────────────────────────┐
│cleaned_data  │  │  invalid_records.csv   │
│   .csv       │  │  (+ validationError    │
│              │  │   column per row)      │
└──────────────┘  └────────────────────────┘
```

---

## Validation Rules

| Field | Rule |
|---|---|
| `id` | Positive integer; must be unique across the entire file |
| `email` | Must contain exactly one `@`; domain must contain at least one `.` |
| `latitude` | Numeric value in range `[-90, 90]` |
| `longitude` | Numeric value in range `[-180, 180]` |

Rows failing any rule are written to `invalid_records.csv` with a precise, human-readable `validationError` message. The remaining rows are written to `cleaned_data.csv` with all strings trimmed, emails lowercased, and numeric fields properly parsed.

---

## Sample Run Output

```
============================================================
  Data Validator & Cleaner CLI
============================================================
[INFO] Input file  : .../data/sample_input.csv
[INFO] Clean output: .../data/cleaned_data.csv
[INFO] Invalid output: .../data/invalid_records.csv
------------------------------------------------------------

[INFO] Processing row 7: ID=7
  [WARN] Row 7: Email validation failed — Email "not-an-email" must contain exactly one "@" symbol.

[INFO] Processing row 8: ID=8
  [WARN] Row 8: Coordinate validation failed — Latitude "-91" is out of bounds. Must be between -90 and 90.

...

============================================================
  Processing Summary
============================================================
  Total rows processed : 16
  Valid records        : 10
  Invalid records      : 6
============================================================

[DONE] Processing complete.
```

---

## License

Distributed under the [MIT License](LICENSE).
