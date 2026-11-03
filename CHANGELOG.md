# Changelog

All notable changes are listed here, following [Keep a Changelog](https://keepachangelog.com/).

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
