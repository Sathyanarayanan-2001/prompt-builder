# Architecture

One static page, no framework, no libraries at run time. `scripts/build.mjs` inlines everything into `dist/index.html`.

| File | Job |
| --- | --- |
| `src/engine.js` | Templates (fields per request type), smart rule packs, prompt assembly in three layouts, quality scoring, the thinking explanation. Pure functions. |
| `src/reviewers.js` | The reviewer panel: 102 experts with background, skills, trigger words and checks; panel picking; the panel review prompt. Pure data and functions. |
| `src/model.js` | Data shape, canonical JSON, the merge rule, sanitising, backup format. Pure functions. |
| `src/files.js` | Hand-written zip writer, xlsx writer, CSV and gzip. |
| `src/store.js` | IndexedDB storage with a memory fallback, preferences in localStorage (`prompt-builder.` prefix), and folder sync. |
| `src/app.js` | Pages: Start, Build, Library, Saved inputs, Setup. Event delegation; hash routing. |
| `src/sw.js` | Service worker: network first, cached copy offline; touches only `prompt-builder-` caches. |

## Data

All data is one object of collections: `builds`, `versions`, `memory`, `profiles`, `cfg`, `lessons`, `feedback`. Every record has `id` and `u` (last update time in ms, strictly increasing on a device). A deletion is a tombstone `{id, d: 1, u}`.

**Merge:** for each record the newer `u` wins; on an exact tie the larger canonical JSON (keys sorted) wins, so every device settles the same way. The merge is commutative, associative and idempotent (tested on randomised data).

**Versions** are separate records, so two devices saving versions of the same prompt at once both keep theirs.

**Memory** ids are a hash of field and value, so the same entry typed on two devices becomes one record.

## Sync

Each device session writes `prompt-builder-save-<UTC yyyymmddhhmmss>-<device>.json.gz` to the chosen folder 3 seconds after a change and when the page is hidden, keeps its newest 3, and on open and on return reads every other save it has not read (tracked by name, modified time and size). A file that cannot be read yet is skipped and retried. A pull waits for a running write.

## Reviewer panel

Each reviewer has trigger words, the kinds of prompt they apply to, and checks written as `[need, problem, fix line, field]`. A reviewer is relevant when their trigger words appear in your inputs; the panel is your added reviewers and eligible favourites, then the most relevant (up to 8), filled to at least 5 with broad reviewers. A check raises a note when the generated prompt does not match `need`; its fix line always satisfies `need` (a unit test enforces this), so adding it clears the note. Panel changes and dismissed notes are stored with the draft and saved with each version, but do not count as prompt changes.

## Feedback and lessons

`Engine.diagnose({issues, response})` runs 17 problem patterns. Each reads your description (a regular expression) and, where useful, the pasted answer (a check such as three or more questions in the first lines, placeholder code, example.com links, an unclosed code block). Anything unmatched becomes a custom lesson from your own words.

A lesson has a mode (`step` adds its line to a "Lessons from earlier answers" section; `warn` shows a warning while building), a scope (one or more kinds of prompt, every prompt, or prompts mentioning chosen words), a seen count and the prompts it came from. Reporting the same pattern again for an overlapping scope updates the existing lesson. Lessons sync like every other record.

## Smart rule packs

A pack has trigger words, the request types it applies to, lines to add to named sections, and a one-line reason that appears in the Thinking tab. Packs marked `onlyIfEmpty` supply a default only when you left that field empty. Packs can be switched off per prompt.
