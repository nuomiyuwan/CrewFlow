# Changelog

All notable changes to CrewFlow are documented in this file.

## 1.2.8 - 2026-07-27

### Improved

- Made customer province and customer unit optional when creating a project.
- Stopped auto-selecting the first saved customer and allowed existing projects to clear customer information.
- Added a consistent `客户未填写` fallback across project and finance summaries.

## 1.2.7 - 2026-07-23

### Fixed

- Show the project manager in each Project Settlement list row instead of an empty collection-plan placeholder.

## 1.2.6 - 2026-07-23

### Added

- Added an editable contract-name field to Party A business details, independent from the project name.

## 1.2.5 - 2026-07-23

### Improved

- Hide the Team Load risk row when a member has no related risk projects.

## 1.2.4 - 2026-07-23

### Improved

- Show the active-project count for team members tagged as project managers in Team Load.

## 1.2.3 - 2026-07-23

### Improved

- Refined the project-detail workflow display: removed the outer card frame and added directional arrows between stages.

## 1.2.2 - 2026-07-23

### Improved

- Simplified right-click calendar plan entry: the clicked date is used automatically, and plan time/type are no longer requested.
- New custom calendar plans are internally marked as `自定义计划`; editing existing plans preserves their original display metadata.

## 1.2.1 - 2026-07-22

### Fixed

- Made customer units editable during project intake and saved newly entered values to the selected province's reusable customer-unit list.
- Synced customer-unit changes made while editing a project back to the matching province's intake candidates without altering historical projects.
- Added protected customer-unit deletion: linked projects must be reassigned to a replacement unit before the old option can be removed.

## 1.2.0 - 2026-07-22

### Added

- Added a SQLite team database stored on the always-on CrewFlow Server host.
- Added automatic migration from the existing team JSON file with an untouched source file and a timestamped pre-migration backup.
- Added granular project, task, calendar, finance, staff, account, and settings change tracking.
- Added daily SQLite backups with rolling retention in the team server data directory.
- Added per-computer weather city selection with cached live weather on the dashboard.
- Added per-account, per-computer work schedules with support for overnight shifts.
- Added read-only China public-holiday and adjusted-workday display using holiday-cn, with local caching and an offline fallback.

### Improved

- Replaced full team-data polling with lightweight incremental synchronization while retaining compatibility with older clients and servers.
- Kept the legacy full-data API available for staged upgrades and one-time single-user data imports.

### Fixed

- Fixed duplicate dashboard delivery-node keys when different projects share the same date and milestone title.
- Fixed the dashboard weekly delivery metric so it only counts calendar entries from Monday through Sunday of the current local week.
- Fixed legacy calendar date comparisons that could shift by one day because of UTC conversion.
- Limited the project center list viewport to five projects and added internal scrolling for additional projects.
- Prevented data-source transitions or failed team connections from saving stale local state into the team database.
- Added server-side protection against accidental whole-collection deletion requests.

## 1.1.0 - 2026-07-21

### Added

- Added an independent project health setting for normal, waiting, and at-risk projects.
- Added automatic overdue detection based on the delivery date for active projects.
- Added in-app version display, release checks, and a compact update notice linked to GitHub Releases.
- Added internal or outsourced assignment switching when editing existing project tasks.

### Improved

- Replaced the video-specific dashboard material metric with pending client settlement projects.
- Linked feedback workflow nodes to dashboard waiting counts, project labels, filters, and priorities.
- Kept the version indicator beside the CrewFlow brand and reduced update UI visual weight.

### Fixed

- Serialized team-mode writes and paused polling during pending saves to prevent repeated revision conflicts.
- Restored missing delivery calendar entries for existing projects and protected the final project delivery node from deletion.
- Prevented revision or modification workflow states from being treated as project risk automatically.
- Kept project, task, calendar, and staff updates synchronized across related views.

## 1.0.0 - 2026-07-15

- First stable release with project intake, task assignment, delivery calendars, team workload, staff and account management, archives, finance tracking, single-user storage, and LAN team mode.
