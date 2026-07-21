# Changelog

All notable changes to CrewFlow are documented in this file.

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
