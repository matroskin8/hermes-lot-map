---
name: hermes-lot-map
description: Open the Hermes Lot Map visualization for the current Codex chat in a side pane.
---

Run `python3 <plugin-root>/codex/start.py --session <current-chat-id>`, using the actual current chat ID. If the ID is unavailable, omit `--session` and explain that the latest local chat is selected. Open the returned URL with `open_in_codex` on the right when available. A queued response does not prove the pane is visible.

The map reads local Codex session logs and, after the user trusts this plugin's hooks in Codex Settings, metadata-only lifecycle events. It does not alter tool execution. The service binds to localhost and continues running until stopped. Do not edit hook trust records to bypass review.
