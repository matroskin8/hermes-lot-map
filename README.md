# Hermes Lot Map

A live activity map for Hermes Desktop and Codex, based on [Panoptes](https://github.com/huwhitememes/panoptes) and using the original renderer from [lot-map](https://github.com/alexeyw/lot-map). It shows a map beside the chat, with stations for tools, files, shell, web, browser, agents, memory, and user interaction.

> **Experimental:** filtering is based on the window-level focused runtime and its owner; live Desktop event routing and isolation have not been verified. Ambiguous or missing identifiers are dropped.

## Features

- Animated colored trails follow each observed event’s actual origin and destination, with return trails for completions and markers for failures. Outbound trails fade to half opacity over 30 seconds; return trails fade over 60 seconds. Chronological station-to-station links are not drawn; only matching focused-session events are displayed.
- Active tool calls orbit their station (static dots with reduced motion). Active identified calls and observed model intervals receive separate overlay satellites; each identified active child receives its own satellite and independently completes. Parent delegations and children may both appear because gateway events do not reliably identify their relationship; no correlation is invented. The ×N badge counts observed entries, not necessarily distinct underlying work.
- Preview: animated overlay satellites use up to ten stable concentric slots per island, spaced 4.75 SVG units apart with radius 4 and stroke width 1.5; physical overlap between satellites is expected. The first orbit retains the original nearest-island-capped radius (normally 48 around Hermes and 30 around other islands). Outer orbits intentionally overlap other islands and may leave the viewport. Further active calls retain their trails and wait for the smallest free slot; they may finish before admission. If an expanded orbit already contains the route's starting point, its inbound path travels outward to contact the orbit; this can cross artwork.
- Station counters and a central context-usage indicator when usage is available.
- Activity feed with individual retained observations, local start times, station, status and duration; running entries display elapsed whole seconds. It retains active entries and recent history rather than folding consecutive calls. Unlike original lot-map, it does not derive labels from tool arguments.
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

With Node.js 20 or newer and npm, install the locked test dependencies and run every check (including DOM, React, and all ordered worker routes) with one command:

```sh
npm ci && npm test
```

The route sweep can take over a minute. The DOM tests use jsdom and stub browser workers; they do not verify live Desktop event delivery or rendering in a real browser.

A route calculation error is shown in the pane and playground; in the playground it persists through refresh and clears on retry or reset. Later map updates can retry. The pre-existing 15-second Worker request deadline remains unchanged. Reduced motion uses non-animated, periodically refreshed elapsed rings and static active markers.

## Requirements and installation

### Codex

Codex serves `desktop/map-renderer.js`, `desktop/route-generator.js`, and `desktop/overlay-engine.js` directly. The Desktop plugin bundles those same source files through `test/build-shared.mjs`; Codex has only a separate local event adapter, not a separate map engine. Python 3.9+ is sufficient; the Codex pane has no npm or external service dependency. From a checkout, run:

```sh
python3 codex/start.py --session YOUR_CODEX_CHAT_ID
```

Open the returned `127.0.0.1` URL in a Codex browser pane or a normal browser. The session selector can switch chats. Without a session ID, the most recently modified local chat is selected. The service listens only on loopback and reads Codex's local session logs. It never sends prompts, tool arguments, or tool output to the browser.

For lifecycle events with precise starts, completions, errors, and subagent activity, install the Codex plugin from this repository:

```sh
codex plugin marketplace add https://github.com/matroskin8/hermes-lot-map
codex plugin add hermes-lot-map@hermes-lot-map
```

Restart Codex, then review and trust the **Hermes Lot Map** hooks in **Settings → Hooks**. Ask Codex to open the Hermes Lot Map pane or invoke `$hermes-lot-map`. The plugin records only event names, tool names, call IDs, agent IDs, model names, timestamps, and error flags in `$CODEX_HOME/hermes-lot-map/events/`. Existing chats continue using session logs until resumed with the plugin loaded. The service remains running until stopped. No Hermes backend is needed for Codex mode.

Codex log formats can change. Hooks are advisory and may not cover every internal or batched call. The context percentage is an approximation from reported token usage. The pane's Map Settings section offers the same route styles, trail fades, and satellite limit as Desktop; choices are saved locally in the browser and apply to new calls. Motion follows the system preference. Pane opening is agent-mediated; Codex may queue the request without immediately showing the pane. The Codex event adapter is separate from Desktop; both modes share the renderer and overlay.

### Hermes Desktop

The upstream plugin declares Hermes 0.21.7 or newer. Compatibility with all Desktop builds is not guaranteed.

Install the Desktop plugin from within Hermes Desktop:

1. Open **Settings → Plugins → Install from GitHub / Git URL**.
2. Enter `https://github.com/matroskin8/hermes-lot-map`.
3. If asked which components to install, select **Desktop**. If the backend component is already installed, it does not need to be replaced.
4. Open **Capabilities → Plugins** and enable **Hermes Lot Map** if needed. The pane appears in the workspace.

For a native Desktop connected to a remote backend, installing only on the backend with `hermes plugins install` does not install the Desktop UI on the local computer. Use the Desktop installation steps above. The plugin ID is `hermes-lot-map`, distinct from the original `panoptes`; coexistence has not been verified.

## Privacy and limitations

The Desktop event tap fans in multiple sessions, profiles and connections. Events require an exact match against the SDK focused runtime ID, owner connection ID and owner profile; missing or ambiguous identity is ignored. The focus is window-level rather than independently bound to each pane. Switching focus clears the board and overlay. This filtering has not been verified with live Desktop event routing. Model names, tool names and aggregate activity are visible. Tool arguments, status text and child goals are not displayed or retained. Avoid sharing the pane if that visibility is unacceptable. Live Desktop event delivery, appearance and animation have not yet been verified. The adaptation has not received a security audit.

## Credits and license

- [Panoptes](https://github.com/huwhitememes/panoptes) by **Hu White** — the foundation for the Hermes Desktop event bridge and activity feed.
- [lot-map](https://github.com/alexeyw/lot-map) by **Aleksei Volodin** — the original renderer adapted for this project; Panoptes was also inspired by lot-map.
- [matroskin8](https://github.com/matroskin8) — maintainer of Hermes Lot Map and its adaptation.

The original lot-map drawing code and its dependencies are vendored in `vendor/lot-map`; its MIT notice is in [vendor/lot-map/LICENSE](vendor/lot-map/LICENSE). Hermes Lot Map is distributed under the **MIT License**; upstream copyright and permission notices are preserved in [LICENSE](LICENSE).

### Flight overflow

Flights start without waiting for an orbit slot; the outbound dot and trail share the same route and 800 ms clock. Completion returns start no earlier than 800 ms after the task starts, including quick completions. Slots are assigned only to still-active tasks, and existing satellites keep their radii. If a slot opens after a flight has already started without one, its route cannot be changed without moving the visible dot: the original route and trail are preserved, and the satellite appears on the assigned orbit after arrival. Consequently this late-admission handoff may visibly jump from the route endpoint to the orbit; an already-arrived task gains its satellite when admitted. With more flights than distinct safe routes, paths may overlap. Worker calculation or a suspended browser can delay rendering.
