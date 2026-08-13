# Changelog

All notable changes to CrewFlow are documented in this file.

## 1.4.4 - 2026-08-13

### Improved

- Allowed project managers to create, edit, assign, and remove tasks within their own active projects while keeping archived projects restricted to controllers and administrators.
- Serialized team writes on the host and automatically merged concurrent changes that affect different projects, tasks, or calendar plans.
- Automatically retried safe client writes after a team-data revision change and kept same-record conflicts protected from accidental overwrites.

### Fixed

- Added the missing date field when editing an existing Delivery Calendar plan, with project deadline, overdue, and risk state reconciled after saving.
- Prevented an otherwise valid project creation or update from disappearing when another computer saved unrelated team data at the same time.
- Showed a clear team-save error when a network or host failure prevents data from being written.

## 1.4.3 - 2026-08-08

### Added

- Added universal macOS DMG and Windows NSIS Setup packaging for installer-based distribution.
- Added in-app update downloads with visible progress. Windows can install and restart from CrewFlow; macOS opens the downloaded DMG for manual replacement.
- Added team-service runtime metadata so an installed update can repair a background service that still points to an older portable app path.

### Improved

- Kept the team service available while an update downloads and stopped it only when Windows begins installation.
- Automatically restored or repaired the local team service after an update or first migration from the portable ZIP build.
- Updated the Chinese user guide with installer migration, unsigned-package warnings, and team-host update behavior.

### Security

- Restricted in-app macOS downloads to CrewFlow assets on the official GitHub Release path and verified GitHub SHA-256 digests when available.
- Updated the production `js-yaml` dependency to a version without the known resource-consumption advisory.

## 1.4.2 - 2026-08-03

### Added

- Added reusable online-model profiles for CrewFlow Assistant. A tested configuration can now be saved and switched from the model selector without re-entering its API endpoint, model name, or key.
- Added a completion state to Delivery Calendar plans. Managers can mark each plan complete or restore it to pending directly from the selected project's schedule.

### Improved

- Kept completed calendar plans visible as history while excluding them from upcoming-delivery counts and risk calculations.
- Added completion state to assistant calendar context, so online and local models can distinguish completed plans from pending work.

### Fixed

- Recalculated project health immediately when a calendar plan is completed, restored, moved, edited, or deleted.
- Only mark a project at risk when a non-final delivery plan is overdue and still pending. Only mark it overdue when its final delivery plan is overdue and still pending.
- Reset a plan to pending when its date, title, or project is changed, preventing a completed historical plan from being treated as a completed new plan.

## 1.4.1 - 2026-07-31

### Added

- Expanded CrewFlow Assistant's permission-aware confirmation drafts to cover project health, workflow status, project manager, task status, weather city, work schedule, and page navigation.
- Added built-in product guidance to the assistant context so it can answer common CrewFlow usage questions.

### Improved

- Kept assistant actions within the signed-in account's existing visibility and edit permissions, with explicit confirmation before saving and sensitive operations excluded.
- Linked finance settlement labels to invoice and payment progress so an invoiced project with an outstanding balance is shown as pending collection.
- Calculated project progress from the current workflow stage while preserving completed and archived projects at 100%.

### Fixed

- Allowed numeric reusable values such as years to be added when their parent category is entered at the same time.
- Kept crowded calendar-day popovers fully visible, internally scrollable, and draggable without being clipped by the calendar container.

## 1.4.0 - 2026-07-30

### Added

- Added task-board date filters for all tasks, today, this week, or a specific date.
- Added long-press calendar-plan dragging between visible dates, with permission checks and immediate project schedule reconciliation.
- Added an overflow popover for calendar days containing more plans than can fit in the month grid.
- Added multiple project-folder paths while preserving the existing primary project path.
- Added an optional completed-evidence folder path for each project task.
- Added current project names and workflow stages to each Team Load member card.
- Added globally editable labels for the two customer classification fields, allowing industry-neutral names such as “大客户” or “合作单位”.
- Added a built-in Chinese user guide with searchable sections, independent scrolling, a first-use entry, and a permanent sidebar entry.

### Improved

- Refined dashboard “今日任务” to include work currently in production or revision as well as tasks due today.
- Counted active projects without a finance record as pending settlement until they are explicitly marked settled.
- Kept project, risk, overdue, next-milestone, and calendar state synchronized after plans are moved or edited.
- Improved nested-list scrolling so scroll input returns to the page when an inner list has no remaining scroll range.
- Added project-folder and task-evidence paths to global search.
- Reworked the project task/evidence layout to separate task controls from completed-material paths.
- Added clearer in-app manual update instructions and documented OpenRouter free-model setup.

### Fixed

- Prevented dense task evidence controls from overflowing or crowding the project task row.
- Centered the project-folder add icon inside its button.
- Replaced the assistant message area's bright system scrollbar with the app's compact dark scrollbar.
- Preserved existing project, task, calendar, finance, and team data when the new optional path and label settings are absent.

## 1.3.2 - 2026-07-28

### Added

- Added high-detail image understanding for online multimodal models, with image selection, drag-and-drop, clipboard paste, previews, and explicit size limits.
- Added automatic discovery of installed Ollama chat models and fast-response or deep-thinking modes for local AI.

### Improved

- Routed model-recognized natural-language intents through the same confirmation-window workflow regardless of the user's phrasing.
- Moved assistant quick prompts beside the composer and made them reflect the current page, visible workload, risks, calendar nodes, and finance follow-ups.
- Added independent, viewport-bounded scrolling for Delivery Calendar project and node lists so growing schedules no longer stretch the entire workspace.
- Changed assistant calendar actions to open the existing Delivery Calendar plan form with the extracted project, date, content, and owner prefilled.
- Kept the final save under the signed-in user's existing calendar permissions and explicit confirmation.
- Recognized follow-up instructions such as “直接加进去” by extracting plan details from the recent conversation.
- Reused the most recently extracted plan for immediate follow-up actions instead of depending on the model to repeat structured output.
- Recognized short follow-up instructions such as “你帮我写入” and aligned model capability descriptions with the calendar-prefill workflow.
- Automatically treated messages containing a visible project, explicit dates, and node details as calendar candidates.
- Normalized misleading model replies that denied all write support, while preserving the required user-confirmed save step.
- Added a unified assistant operation-draft protocol for project creation, project stage/status updates, and task assignment.
- Reused the existing project forms for all assistant operations so account permissions, field validation, data synchronization, and final confirmation remain unchanged.
- Added deterministic local intent fallback for project, work-type, staff, status, and date matching when an online model returns malformed structured output.
- Counted overdue active projects consistently in dashboard, filtering, assistant, and team-load risk summaries.
- Kept the assistant composer focused after sending and moved compact, context-aware shortcuts beside the input area.

### Fixed

- Reconciled each project's key date and next milestone after delivery-calendar changes so rescheduled projects no longer remain incorrectly overdue or at risk.
- Kept Delivery Calendar project and milestone lists within the viewport while allowing normal page scrolling when an inner list has nothing to scroll.
- Removed accidental horizontal scrolling from the assistant panel and restored reliable window dragging from non-interactive top-bar areas.

## 1.3.0 - 2026-07-27

### Added

- Renamed the built-in production assistant to the industry-neutral CrewFlow Assistant.
- Added per-computer assistant modes for local rules, OpenAI-compatible online APIs, and local Ollama models.
- Added operating-system-protected API key storage that is never written to the single-user or team project database.
- Added connection testing, model settings, project-context controls, optional finance context, and local-rule fallback.
- Added AI-assisted chat-record extraction into editable calendar candidates with explicit user confirmation before any write.

### Improved

- Reworked assistant suggestions and replies to use general project-management language across industries.
- Limited model context to data visible to the signed-in account and retained existing calendar write permissions.
- Automatically scroll assistant conversations to the latest message and hide model reasoning blocks from user-facing replies.
- Made chat-record extraction conversational: the assistant now waits for the next pasted message when users announce that content is coming.
- Improved MiniMax-compatible calendar parsing when structured JSON is surrounded by explanatory text.
- Allowed online and local AI modes to handle normal conversation without forcing every answer into CrewFlow workflows.
- Changed the response indicator to “正在思考” and stopped capability questions or cancellations from being mistaken for pasted chat records.

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
