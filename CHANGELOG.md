# Changelog

All notable changes are listed here, following [Keep a Changelog](https://keepachangelog.com/).

## [1.5.0] - 2026-11-04

### Added
- Paste panel answer: paste Claude's reply to the panel review prompt and its improvements are mapped back onto your fields. The panel prompt now asks Claude to return every field in a JSON block; without one, each section of the improved prompt is compared line by line with the current prompt.
- A preview shows each field now and after the panel; untick what you do not want, then apply. Changed fields are marked "Changed by panel" until you save.
- Lines the tool adds itself never land in your fields; if the panel removed one, that addition is switched off and its other kept lines become yours.
- The panel's answer is stored with the next version ("Panel reviewed"); unmatched text can be stored as a Review prompt.

### Fixed
- Section headings with a lowercase note, such as "RULES (exact)", are coloured as headings in the prompt view.

## [1.4.0] - 2026-11-04

### Added
- 99 more reviewers (201 in all, 19 fields, 370 checks). New fields: algorithms and problem solving (algorithmic thinker, complexity, data structures, graphs, dynamic programming, operations research, numerical methods, concurrency, distributed systems, invariants, date/time and units correctness), AI agents and automation (LLM apps, agent design, retrieval, evaluations, red-teaming and prompt injection, automation, prompt chains, token cost, human in the loop), energy transition (solar, battery storage, hybrids, hydrogen, EV charging, energy audit, transmission, power system studies, forecasting and scheduling, carbon), quality and operations (ISO 9001, Six Sigma, root cause, reliability, maintenance, lean, supply chain, inventory, calibration, document control), mathematics and modelling, infrastructure and IT, people and communication.
- More reviewers in software, finance (GST invoicing, payroll, cash flow, costing), legal (consumer protection, Electricity Act, accessibility), training, research and critical thinking (pre-mortem, inversion, second-order and Socratic thinking).

## [1.3.0] - 2026-11-04

### Added
- Reviewer panel: 102 built-in experts in 12 fields (software, data and AI, finance, wind energy and power, writing, training, design, research, management, legal, health, critical thinking), each with a background, skills and checks.
- The best 5 to 8 are picked for each prompt from its words and kind; add or remove reviewers per prompt, and star favourites to include them whenever they fit.
- Reviewers tab: each note names the problem and a ready line; Add to prompt puts it in the right field, Dismiss hides it.
- Copy panel review prompt: asks Claude to run the same panel with real AI and return an improved prompt.

## [1.2.0] - 2026-11-03

### Changed
- Setup is a settings list: each row has its name and explanation on the left and its control on the right, on one line; rows stack cleanly on phones. Fixes the Install button sitting out of line with the Appearance list.
- Labelled controls placed side by side share a bottom edge (Build profile row, Feedback version and result).
- Feedback result and lesson mode use segmented controls.
- Item actions (Library, versions, lessons, profiles, saved entries) form one right-aligned group with Delete set apart; on phones they fill the row.
- Dialogs keep their buttons visible while the content scrolls, and open as bottom sheets on phones.
- Phones get an Inputs / Prompt switch on Build, so the prompt is one tap away instead of below every field.
- Saved entries are grouped in collapsible sections with counts; open sections stay open.
- Touch screens get 44 px controls; correct singular and plural counts on Setup.

### Added
- Automated layout checks on every page, desktop and phone, light and dark: aligned controls, labelled inputs, WCAG AA text contrast, 44 px touch targets.

## [1.1.1] - 2026-11-03

### Fixed
- Restoring a backup after deleting items said "Nothing new in that backup": deletions are newer than the backup, so they won. Restore now shows what it will add, update or bring back, and offers to bring back items deleted on this device (on by default). Deletions inside a backup are ignored, so restore never deletes.
- Sections you open on Build stay open after the page redraws (for example after Save version).
- The quality Fix button no longer opens an empty "Previous" list and takes focus from the field.

### Added
- Browser tests that click every action in the app, and the delete-then-restore case.

## [1.1.0] - 2026-11-03

### Added
- Feedback tab: record how an AI answer went; 17 problem patterns turn it into lessons.
- Lessons apply as a step in future prompts or as a warning; manage them in Saved inputs.
- Excel export gains Lessons and Feedback sheets.

### Changed
- Smart packs trigger more precisely (for example "Excel sync" no longer adds multi-device rules).
- GitHub Actions moved to Node 24 versions: checkout v6, setup-node v6, upload-pages-artifact v5, deploy-pages v5.

### Removed
- Prompt Manager import and export.

## [1.0.0] - 2026-11-03

### Added
- Eight request templates, profile block, field memory with Previous picker and suggestions.
- Offline rule engine: 18 smart packs, prompt assembly in plain, Markdown or XML layout.
- Thinking tab, quality score with Fix buttons, version history with line comparison.
- Library with search and filters; Saved inputs page; Setup with sync, backup, Excel, CSV and sample data.
- Prompt Manager import (zip or folder) and export in its folder format.
- OneDrive folder sync, service worker, web manifest and icons.
