# 🧹 Data Validator & Cleaner CLI

A lightweight, production-ready CLI tool built with **Node.js** and **TypeScript** that reads a CSV file, validates each row against a set of rules, separates valid from invalid records, cleans the valid data, and writes two output CSV files.

---

## 📁 Project Structure

```
data-validator-cli/
├── data/
│   ├── sample_input.csv      ← Your input data goes here
│   ├── cleaned_data.csv      ← Auto-generated: valid, clean records
│   └── invalid_records.csv   ← Auto-generated: bad records + reason
├── src/
│   ├── index.ts              ← Main entry point & pipeline orchestrator
│   ├── types.ts              ← All TypeScript interfaces and type aliases
│   ├── validator.ts          ← Validation rule functions
│   └── cleaner.ts            ← Data sanitization and type conversion
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### 1. Install Dependencies

```bash
npm install
```

This installs:
- **`csv-parser`** — A fast, streaming CSV reader for Node.js.
- **`fast-csv`** — A CSV formatting and writing library.
- **`ts-node`** — Runs TypeScript files directly without a build step (for dev).
- **`typescript`** — The TypeScript compiler.

---

## ▶️ Running the Tool

### Development Mode (Recommended for Learning)

Runs the TypeScript source directly using `ts-node`. No build step needed.

```bash
npm run dev
```

### Production Mode (Compiled JavaScript)

First compile TypeScript to JavaScript, then run the output.

```bash
npm run build
npm run start
```

---

## ⚙️ Execution Flow

The program runs in 4 clear stages:

```
[READ]     → fs.createReadStream() + csv-parser reads sample_input.csv row by row (streaming)
    ↓
[VALIDATE] → validator.ts checks each row against ID, email, and coordinate rules
    ↓
[CLEAN]    → cleaner.ts trims, normalizes, and type-converts valid rows
    ↓
[WRITE]    → fast-csv writes cleaned_data.csv and invalid_records.csv
```

---

## ✅ Validation Rules

| Field       | Rule                                                              |
|-------------|-------------------------------------------------------------------|
| `id`        | Must be a **unique, positive integer**                           |
| `email`     | Must contain exactly one `@` and a domain with a `.`             |
| `latitude`  | Must be a number between **-90** and **90** (inclusive)          |
| `longitude` | Must be a number between **-180** and **180** (inclusive)        |

Invalid rows are **never crashed on** — they are gracefully captured and logged.

---

## 📊 Sample Input Data

The file `data/sample_input.csv` is included and contains 15 test rows with deliberate errors:

| ID | Name            | Email                          | Lat       | Lon        | Country   | Expected Result             |
|----|-----------------|--------------------------------|-----------|------------|-----------|-----------------------------|
| 1  | Alice Johnson   | alice.johnson@example.com      | 40.7128   | -74.0060   | USA       | ✅ Valid                    |
| 2  | Bob Smith       | bob.smith@techcorp.io          | 51.5074   | -0.1278    | UK        | ✅ Valid                    |
| 3  | Carlos Diaz     | carlos.diaz@mail.es            | 40.4168   | -3.7038    | Spain     | ✅ Valid                    |
| 4  | Diana Prince    | diana@wonderwoman.org          | 48.8566   | 2.3522     | France    | ✅ Valid (whitespace trimmed)|
| 5  | Eve Torres      | eve.torres@gmail.com           | -33.8688  | 151.2093   | Australia | ✅ Valid                    |
| 6  | Frank Castle    | FRANK@PUNISHER.NET             | 35.6762   | 139.6503   | Japan     | ✅ Valid (email normalized)  |
| 7  | INVALID_ROW     | not-an-email                   | 99.9999   | -74.0060   | USA       | ❌ Invalid email             |
| 8  | Grace Hopper    | grace@navy.mil                 | -91.0000  | 0.0000     | USA       | ❌ Latitude out of range     |
| 9  | Hank Pym        | *(empty)*                      | 37.7749   | -122.4194  | USA       | ❌ Email is empty            |
| 10 | Iris West       | iris.west@ccpd.gov             | 39.9042   | 116.4074   | China     | ✅ Valid                    |
| 1  | Duplicate ID    | duplicate@test.com             | 0.0000    | 0.0000     | Ocean     | ❌ Duplicate ID              |
| 11 | Jack Sparrow    | jack@blackpearl                | 14.0583   | 108.2772   | Vietnam   | ❌ Email domain missing `.`  |
| 12 | Karen Page      | karen.page@kingpin.com         | 41.9028   | 12.4964    | Italy     | ✅ Valid                    |
| 13 | Luke Cage       | luke@harlem.nyc.us             | 0.0000    | 200.0000   | USA       | ❌ Longitude out of range    |
| 14 | Matt Murdock    | matt.murdock@nelsonanmurdock.law| -22.9068 | -43.1729   | Brazil    | ✅ Valid                    |
| 15 | Nancy Wheeler   | nancy@hawkins.in.gov           | 45.4215   | -75.6919   | Canada    | ✅ Valid                    |

---

## 📤 Output Files

After running the tool, two files are written to the `data/` directory:

### `data/cleaned_data.csv`
Contains only the valid, sanitized records with proper types and normalized values (e.g., emails in lowercase, whitespace removed).

### `data/invalid_records.csv`
Contains the raw values of failed rows, plus a new `validationError` column that explains exactly why the row was rejected.

---

## 🧠 Key TypeScript & Node.js Concepts Used

| Concept | Where | Why |
|---|---|---|
| **Interfaces** | `src/types.ts` | Define the shape of data objects as contracts between modules |
| **Type Aliases** | `src/types.ts` | `ValidationError = string \| null` models exactly two outcomes |
| **Type Narrowing** | `src/cleaner.ts` | Convert `RawCsvRow` (all strings) to `ValidatedRecord` (typed) |
| **Generic Functions** | `src/index.ts` | `writeCsv<T>()` works for any object type without code duplication |
| **Async/Await** | `src/index.ts` | Write readable async code that waits for I/O without blocking |
| **Readable Streams** | `src/index.ts` | Process huge CSV files row-by-row without loading into memory |
| **Module Scoped State** | `src/validator.ts` | `seenIds` Set persists across calls to detect duplicate IDs |
| **Spread Operator** | `src/index.ts` | `{ ...row, validationError }` extends objects immutably |

---

## 🔧 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run directly with `ts-node` (no build step) |
| `npm run build` | Compile TypeScript → JavaScript in `dist/` |
| `npm run start` | Run the compiled JavaScript output |
