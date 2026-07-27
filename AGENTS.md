# Project Agent Instructions & Data Safety Rules

## 1. Strict Data Preservation Rules
- **NEVER delete, wipe, reset, or overwrite user database or localStorage records** during feature updates, code edits, or AI app updates in the chat or build section.
- Existing user data stored under `tipperlog_data_v2` must always be preserved and migrated gracefully if state schema changes.
- Never write code that automatically clears or resets data without explicit user action in the application interface.

## 2. Mandatory Deletion Confirmation
- All deletion actions in the application interface (deleting trips, collaborators, expenses, payments received, or resetting sample data) **MUST require explicit user confirmation** via a popup confirmation modal before executing the deletion.
- No direct or unconfirmed data deletion is permitted anywhere in the application.
