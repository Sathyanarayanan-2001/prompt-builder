# Architecture

One static page, no framework, no libraries at run time. `scripts/build.mjs` inlines everything into `dist/index.html`.

| File | Job |
| --- | --- |
| `src/engine.js` | Templates (fields per request type), smart rule packs, prompt assembly in three layouts, quality scoring, the thinking explanation. Pure functions. |
| `src/model.js` | Data shape, canonical JSON, the merge rule, sanitising, backup format. Pure functions. |
| `src/files.js` | Hand-written zip reader/writer (stored and deflate, zip64 offsets), xlsx writer, CSV, gzip, Prompt Manager folder format. |
| `src/store.js` | IndexedDB storage with a memory fallback, preferences in localStorage (`prompt-builder.` prefix), and folder sync. |
| `src/app.js` | Pages: Start, Build, Library, Saved inputs, Setup. Event delegation; hash routing. |
| `src/sw.js` | Service worker: network first, cached copy offline; touches only `prompt-builder-` caches. |

## Data

All data is one object of collections: `builds`, `versions`, `memory`, `profiles`, `cfg`. Every record has `id` and `u` (last update time in ms, strictly increasing on a device). A deletion is a tombstone `{id, d: 1, u}`.

**Merge:** for each record the newer `u` wins; on an exact tie the larger canonical JSON (keys sorted) wins, so every device settles the same way. The merge is commutative, associative and idempotent (tested on randomised data).

**Versions** are separate records, so two devices saving versions of the same prompt at once both keep theirs.

**Memory** ids are a hash of field and value, so the same entry typed on two devices becomes one record.

## Sync

Each device session writes `prompt-builder-save-<UTC yyyymmddhhmmss>-<device>.json.gz` to the chosen folder 3 seconds after a change and when the page is hidden, keeps its newest 3, and on open and on return reads every other save it has not read (tracked by name, modified time and size). A file that cannot be read yet is skipped and retried. A pull waits for a running write.

## Smart rule packs

A pack has trigger words, the request types it applies to, lines to add to named sections, and a one-line reason that appears in the Thinking tab. Packs marked `onlyIfEmpty` supply a default only when you left that field empty. Packs can be switched off per prompt.
