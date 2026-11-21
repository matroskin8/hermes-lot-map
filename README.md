# Hermes Lot Map

A live activity map for Hermes Desktop, based on [Panoptes](https://github.com/huwhitememes/panoptes) and using the original renderer from [lot-map](https://github.com/alexeyw/lot-map). It shows a map beside the chat, with stations for tools, files, shell, web, browser, agents, memory, and user interaction.

> **Experimental:** filtering is based on the window-level focused runtime and its owner; live Desktop event routing and isolation have not been verified. Ambiguous or missing identifiers are dropped.

## Features

- Animated colored trails follow each observed event’s actual origin and destination, with return trails for completions and markers for failures. Outbound trails fade to half opacity over 30 seconds; return trails fade over 60 seconds. Chronological station-to-station links are not drawn; only matching focused-session events are displayed.
- Active tool calls orbit their station (static dots with reduced motion). Active identified calls and observed model intervals receive separate overlay satellites; each identified active child receives its own satellite and independently completes. Parent delegations and children may both appear because gateway events do not reliably identify their relationship; no correlation is invented. The ×N badge counts observed entries, not necessarily distinct underlying work.
- Animated overlay satellites use stable concentric slots, 9.5 SVG units apart (the stroked dot has a 4.75-unit footprint radius). The outer edge stays within half the distance to the nearest island centre. Capacity is finite; extra active calls keep their flight but their satellite waits hidden until a slot is freed. Inner slots may cross the island artwork, and this cap does not guarantee clearance from labels or neighbouring artwork.
- Station counters and a central context-usage indicator when usage is available.
- Activity feed with recent calls and durations.
- A Hermes Desktop side pane and a reduced-motion setting inherited from Panoptes.

The plugin listens to Desktop gateway events; it does not modify tool execution. The SVG drawing is an adapted lot-map renderer, bundled from the vendored MIT source at commit `5c5833d7380976fda671975d32fcec9c1bc3ef79`; the event bridge and feed are Panoptes-derived, not a feature-complete port.

### Event mapping and gaps

- `tool.start` / `tool.complete`: file tools → Files; terminal, execute_code, process_manage → Shell; web_search/web_extract → Web; browser_exec/browser_cdp/browser_dialog/browser_vault → Browser; delegate_task and cronjob variants → Agents; memory, hindsight_* and lcm_* → Memory; clarify and todo variants → You; all others, including MCP and skill tools → Skills. The gateway may suppress tool events when tool progress is disabled. Missing IDs/session IDs cannot be correlated and are ignored.
- `message.delta`, `reasoning.delta`, `thinking.delta`, `tool.generating` start an observed Model activity interval; further chunks do not restart it. A correlated `tool.start` or `message.complete` ends it and draws a return. These are observations, not API request boundaries or call counts; without stream events no model interval is invented. Tool events may be suppressed. `session.info.model` and `session.usage.model` supply the displayed model and switch animation. `message.complete` marks an answer.
- `session.usage` supplies context_tokens/context_length, total_tokens and api_calls when present; `todo.updated` supplies only the count.
- `subagent.start` and terminal-status `subagent.complete` (including canceled/cancelled) show a child at Agents when both have the same subagent_id and route; older events without identity or status are omitted. Child goals, text, tool previews and results are not retained. Other child events are not mapped because they do not provide a matching tool lifecycle.
- Hooks remain inactive: the inspected Desktop gateway event contract exposes no hook-execution event. No hook activity is inferred from unrelated events.

Missing completions time out after **6 hours (21,600,000 ms)** by default and become unknown (`?`), not failed: the satellite disappears and the trail fades neutrally. A matching late completion replaces the unknown result. Set the plugin storage key `lostCompletionMs` to a number of milliseconds (minimum 60,000) to change it; invalid values use the default. Long work can still legitimately exceed this threshold, so unknown does not imply it stopped.

## Building and testing

`desktop/map-renderer.js`, `desktop/map-reconcile.js` and `desktop/overlay-engine.js` are the shared sources. Run `node test/build-shared.mjs` to embed them into both self-contained artifacts, and `node test/build-shared.mjs --check` to detect drift. The playground simulates calls; production uses observed gateway events. Elapsed indicators are supported on all ten islands, but only appear for genuinely observed active intervals. Hooks lack a gateway lifecycle; You appears active only on an observed mapped tool.

Run the dependency-free checks with `node test/check-shared-overlay.mjs`, `node test/harness.mjs`, `node test/overlay-clock.mjs`, `node test/worker-failures.mjs`, and `node test/production-routes.mjs` (the last exercises all ordered worker routes and can take over a minute). DOM and React checks (`test/dom-harness.mjs`, `test/render-harness.mjs`, `test/lifecycle-dom.mjs`) require an existing dependency tree containing jsdom, React, React DOM and nanostores: set `HERMES_DESKTOP_DIR` to its root. No dependency lockfile is provided, so these DOM tests are not fully reproducible from this repository alone.

A route calculation error is shown in the pane; later map updates can retry. The pre-existing 15-second Worker request deadline remains unchanged. Reduced motion uses non-animated, periodically refreshed elapsed rings and static active markers.

## Requirements and installation

The upstream plugin declares Hermes 0.21.7 or newer. Compatibility with all Desktop builds is not guaranteed.

Install the Desktop plugin from within Hermes Desktop:

1. Open **Settings → Plugins → Install from GitHub / Git URL**.
2. Enter `https://github.com/matroskin8/hermes-lot-map`.
3. If asked which components to install, select **Desktop**. If the backend component is already installed, it does not need to be replaced.
4. Open **Capabilities → Plugins** and enable **Hermes Lot Map** if needed. The pane appears in the workspace.

For a native Desktop connected to a remote backend, installing only on the backend with `hermes plugins install` does not install the Desktop UI on the local computer. Use the Desktop installation steps above. The plugin ID is `hermes-lot-map`, distinct from the original `panoptes`; coexistence has not been verified.

## Privacy and limitations

The Desktop event tap fans in multiple sessions, profiles and connections. Events require an exact match against the SDK focused runtime ID, owner connection ID and owner profile; missing or ambiguous identity is ignored. The focus is window-level rather than independently bound to each pane. Switching focus clears the board and overlay. This filtering has not been verified with live Desktop event routing. Model names, tool names and aggregate activity are visible. Tool arguments, status text and child goals are not displayed or retained. Avoid sharing the pane if that visibility is unacceptable. Live Desktop event delivery, appearance and animation have not yet been verified. The adaptation has not received a security audit.

## Attribution and license

Based on [Panoptes](https://github.com/huwhitememes/panoptes) by Hu White, itself inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin. The original drawing code and its dependencies are vendored in `vendor/lot-map`; its MIT notice is in `vendor/lot-map/LICENSE`. Distributed under the **MIT License**; the upstream copyright and permission notices are preserved in [LICENSE](LICENSE).
