// =============================================================================
// src/index.ts — Main Entry Point & Orchestration Pipeline
// =============================================================================
//
// THIS FILE IS THE "CONDUCTOR".
//   It doesn't contain business logic itself. Instead, it imports modules
//   that do specific jobs and orchestrates them in the right order:
//
//     1.  READ  → Parse the input CSV file into raw row objects.
//     2.  VALIDATE → For each row, check if data is correct (validator.ts).
//     3.  CLEAN    → Transform valid rows into typed records (cleaner.ts).
//     4.  WRITE    → Output two CSVs: cleaned data & invalid records.
//
// CONCEPT — Async/Await & Streams:
//   File I/O (reading/writing) in Node.js is inherently ASYNCHRONOUS.
//   This means Node.js does NOT freeze/block while waiting for the disk.
//   Instead, it registers a callback and goes off to do other work.
//
//   `async/await` is the modern, readable syntax for working with
//   Promises (the underlying mechanism for async operations). It makes
//   asynchronous code look and behave like synchronous code.
//
//   A STREAM is a way to process data in chunks rather than loading the
//   entire file into memory at once. This is critical for large CSV files
//   (e.g., 1 million rows). csv-parser gives us a readable stream.
//
// =============================================================================

// Node.js built-in modules — no installation needed.
// `node:` prefix is modern best practice to explicitly distinguish
// built-in modules from third-party npm packages.
import * as fs from 'node:fs';
import * as path from 'node:path';

// Third-party library for parsing CSV files as a Node.js stream.
import csvParser from 'csv-parser';

// Third-party library for writing formatted CSV files.
import { format as csvFormat } from 'fast-csv';

// Our own typed interfaces from the centralized types file.
import { RawCsvRow, ValidatedRecord, InvalidRecord, ProcessingResult } from './types';

// Our business logic modules.
import { validateRow, resetValidatorState } from './validator';
import { cleanRow } from './cleaner';

// =============================================================================
// CONFIGURATION: File Paths
// =============================================================================
// `__dirname` is a Node.js global that resolves to the directory of the
// CURRENT file (i.e., the `src/` folder).
//
// `path.join()` safely joins path segments using the OS-appropriate separator
// (backslash on Windows, forward slash on Unix). NEVER concatenate paths with
// string interpolation (`src/ + filename`) — it's not cross-platform safe.
//
// `path.resolve()` is used here to go UP one directory from `src/` (using '..')
// to reach the project root, and then INTO the `data/` folder.
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'sample_input.csv');
const CLEANED_FILE = path.join(DATA_DIR, 'cleaned_data.csv');
const INVALID_FILE = path.join(DATA_DIR, 'invalid_records.csv');

// =============================================================================
// STEP 1: readAndProcessCsv — Parse & Validate
// =============================================================================
/**
 * Reads and processes the input CSV file using a stream.
 *
 * CONCEPT — Why Return a Promise?
 *   The `createReadStream` + `csvParser` pipeline is event-driven and
 *   asynchronous — it fires events ('data', 'end', 'error') over time.
 *   But our `main()` function needs to WAIT for all rows to be processed
 *   before it can write output files.
 *
 *   By wrapping the stream in a `new Promise(...)`, we can use `await`
 *   on this function in `main()`. The Promise only RESOLVES when the stream
 *   fires its 'end' event (all rows done), and REJECTS if an 'error' fires.
 *
 * @param filePath - Absolute path to the input CSV file.
 * @returns A Promise that resolves with the final `ProcessingResult` object.
 */
function readAndProcessCsv(filePath: string): Promise<ProcessingResult> {
  // We explicitly type the arrays to collect results during streaming.
  const validRecords: ValidatedRecord[] = [];
  const invalidRecords: InvalidRecord[] = [];
  let rowNumber = 0; // Track 1-based row number for clear logging.

  return new Promise((resolve, reject) => {
    // -------------------------------------------------------------------------
    // READABLE STREAM: fs.createReadStream
    // -------------------------------------------------------------------------
    // Instead of `fs.readFileSync` (which loads EVERYTHING into memory),
    // `createReadStream` opens the file and reads it in small CHUNKS.
    // These chunks flow through the csv-parser, which re-assembles them
    // into complete row objects. This makes the program memory-efficient
    // regardless of file size.
    fs.createReadStream(filePath)

      // `.pipe()` connects two streams: the file read stream feeds data
      // directly into the csvParser's write stream.
      // csvParser knows how to take raw text chunks and parse them
      // into row objects using the header row as keys.
      .pipe(csvParser())

      // The 'data' event fires once for EACH parsed row object.
      // CONCEPT — Callback with Generic Type:
      //   We use `RawCsvRow` to tell TypeScript what shape `row` has.
      //   Without this, `row` would be typed as `unknown` or `any`.
      .on('data', (row: RawCsvRow) => {
        rowNumber++;
        console.log(`\n[INFO] Processing row ${rowNumber}: ID=${row.id}`);

        // Validate the raw row. Returns null if valid, error string if not.
        const error = validateRow(row, rowNumber);

        if (error !== null) {
          // INVALID PATH: Combine the raw row with the error message
          // to create an InvalidRecord and push to the invalid collection.
          //
          // CONCEPT — Spread Operator (...):
          //   `{ ...row, validationError: error }` creates a NEW object
          //   that has ALL properties of `row` PLUS the `validationError`
          //   property. This is immutable and non-destructive — we are
          //   not modifying the original `row` object.
          const invalidRecord: InvalidRecord = { ...row, validationError: error };
          invalidRecords.push(invalidRecord);
        } else {
          // VALID PATH: Clean and type-narrow the row, then collect it.
          const cleanRecord = cleanRow(row);
          validRecords.push(cleanRecord);
          console.log(`  [OK]   Row ${rowNumber} is valid and clean.`);
        }
      })

      // The 'end' event fires when the ENTIRE file has been read and
      // all 'data' events have been processed. This is the signal to
      // resolve our Promise with the collected results.
      .on('end', () => {
        console.log(`\n[INFO] Finished reading CSV. Total rows processed: ${rowNumber}`);
        resolve({ validRecords, invalidRecords });
      })

      // The 'error' event fires if something goes wrong (e.g., file not
      // found, permission denied, corrupt file). We REJECT the Promise
      // with the Error object, which will be caught in our main() function.
      .on('error', (err: Error) => {
        reject(new Error(`Failed to read or parse CSV file: ${err.message}`));
      });
  });
}

// =============================================================================
// STEP 2: writeCsv — A Reusable Helper to Write Any Array to a CSV File
// =============================================================================
/**
 * Writes an array of record objects to a CSV file.
 *
 * CONCEPT — Generic Functions <T>:
 *   The `<T extends object>` syntax makes this a GENERIC function. It means:
 *   "this function will work for ANY object type T, as long as T is an object."
 *
 *   This allows us to call `writeCsv(validRecords, ...)` where T=ValidatedRecord
 *   AND `writeCsv(invalidRecords, ...)` where T=InvalidRecord — with the SAME
 *   function. We avoid code duplication without sacrificing type safety.
 *
 *   This is one of the most powerful features of TypeScript generics.
 *
 * @param records - The array of objects to write. T can be any object type.
 * @param filePath - The absolute path for the output file.
 * @returns A Promise that resolves when the file is fully written to disk.
 */
function writeCsv<T extends object>(records: T[], filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // fast-csv's `format()` creates a WRITABLE STREAM that formats objects
    // as CSV rows. `headers: true` tells it to write the object keys as
    // the first row of the file.
    const csvStream = csvFormat<T, T>({ headers: true });

    // `fs.createWriteStream` opens/creates a file and accepts streamed data.
    // This is the "sink" — the data flows FROM csvStream INTO the file.
    const writeStream = fs.createWriteStream(filePath);

    // When the write stream successfully finishes and closes, resolve the Promise.
    writeStream.on('finish', resolve);

    // If either stream encounters an error, reject the Promise.
    writeStream.on('error', reject);
    csvStream.on('error', reject);

    // Connect the csv formatter's output to the file writer's input.
    csvStream.pipe(writeStream);

    // Write each record object to the CSV stream.
    // fast-csv will convert each object's key-value pairs into a CSV row.
    for (const record of records) {
      csvStream.write(record);
    }

    // IMPORTANT: We must call `.end()` to signal "no more data is coming."
    // Without this, the stream would stay open forever, the 'finish' event
    // would never fire, and our Promise would never resolve — a deadlock.
    csvStream.end();
  });
}

// =============================================================================
// STEP 3: main — The Top-Level Orchestrator
// =============================================================================
/**
 * The main execution function. Orchestrates the entire pipeline.
 *
 * CONCEPT — Why a `main()` function?
 *   Wrapping top-level logic in a named `async` function is best practice
 *   because:
 *   1. It allows the use of `await` at the top level.
 *   2. It provides a clear entry point.
 *   3. Errors bubble up to a single `.catch()` handler at the bottom,
 *      giving us one place to manage unexpected failures.
 *
 * CONCEPT — `async function`:
 *   Any function declared with `async` automatically returns a Promise.
 *   Inside it, you can use `await` to pause execution until an async
 *   operation completes — without blocking the Node.js event loop.
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Data Validator & Cleaner CLI');
  console.log('='.repeat(60));
  console.log(`[INFO] Input file : ${INPUT_FILE}`);
  console.log(`[INFO] Clean output: ${CLEANED_FILE}`);
  console.log(`[INFO] Invalid output: ${INVALID_FILE}`);
  console.log('-'.repeat(60));

  // Ensure the validator's state is clean before we start.
  // (Particularly important if this were to be called multiple times in tests.)
  resetValidatorState();

  // -------------------------------------------------------------------------
  // STEP 1: Check that the input file exists.
  // -------------------------------------------------------------------------
  // `fs.existsSync` is a synchronous check. Using it ONCE upfront is fine
  // and gives a much friendlier error than letting csv-parser crash.
  if (!fs.existsSync(INPUT_FILE)) {
    // We throw a standard Error object. The message string is what will
    // be displayed. Using `throw` in an `async` function automatically
    // causes the returned Promise to reject.
    throw new Error(
      `Input file not found at: ${INPUT_FILE}\n` +
      `  Please create the file and add sample data before running.`
    );
  }

  // -------------------------------------------------------------------------
  // STEP 2: Read and process the CSV.
  // -------------------------------------------------------------------------
  // `await` pauses `main()` here until `readAndProcessCsv` resolves.
  // The Node.js event loop is NOT blocked during this wait — other I/O
  // could happen concurrently if there were other tasks scheduled.
  //
  // We use destructuring to unpack the result object in one clean line.
  const { validRecords, invalidRecords } = await readAndProcessCsv(INPUT_FILE);

  // -------------------------------------------------------------------------
  // STEP 3: Write the output files.
  // -------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(60));
  console.log('[INFO] Writing output files...');

  // We use `await` for each write to ensure they complete before we log
  // the summary. `Promise.all([...])` would run them CONCURRENTLY (faster),
  // but sequential `await` is clearer for learning purposes.

  if (validRecords.length > 0) {
    await writeCsv(validRecords, CLEANED_FILE);
    console.log(`[SUCCESS] ${validRecords.length} valid record(s) → ${CLEANED_FILE}`);
  } else {
    console.log('[WARN] No valid records to write.');
  }

  if (invalidRecords.length > 0) {
    await writeCsv(invalidRecords, INVALID_FILE);
    console.log(`[SUCCESS] ${invalidRecords.length} invalid record(s) → ${INVALID_FILE}`);
  } else {
    console.log('[INFO] No invalid records found. Great data quality!');
  }

  // -------------------------------------------------------------------------
  // STEP 4: Print the final summary.
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('  Processing Summary');
  console.log('='.repeat(60));
  console.log(`  Total rows processed : ${validRecords.length + invalidRecords.length}`);
  console.log(`  Valid records        : ${validRecords.length}`);
  console.log(`  Invalid records      : ${invalidRecords.length}`);
  console.log('='.repeat(60));
  console.log('\n[DONE] Processing complete.');
}

// =============================================================================
// EXECUTION: Call main() and handle top-level errors.
// =============================================================================
// CONCEPT — `.catch()` on a Promise:
//   Since `main()` is async, it returns a Promise. If anything `throw`s
//   inside `main()` (or if any `await`ed Promise rejects), this `.catch()`
//   handler will be called with the Error object.
//
//   `process.exit(1)` terminates the Node.js process with an exit code of 1,
//   which signals to the operating system (and CI/CD systems) that the
//   program did NOT complete successfully. Exit code 0 = success.
main().catch((error: Error) => {
  console.error('\n[FATAL ERROR]', error.message);
  process.exit(1);
});
