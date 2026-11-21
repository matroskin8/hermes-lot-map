# Hermes Lot Map

A live activity map for Hermes Desktop, based on [Panoptes](https://github.com/huwhitememes/panoptes) and using the original renderer from [lot-map](https://github.com/alexeyw/lot-map). It shows a map beside the chat, with stations for tools, files, shell, web, browser, agents, memory, and user interaction.

> **Experimental:** events from multiple sessions or connections may be mixed; session isolation has not been verified.

## Features

- Animated pulses for tool starts and completions; markers for failures. Fading station-to-station links show observed start order, not causality or call dependencies. Equal timestamps follow arrival order; different sessions may be mixed.
- Active tool calls orbit their station (static dots with reduced motion). Up to six satellites per station are shown for readability; the ×N badge shows the full active count, including subagent observations. Subagent observations do not add a second satellite for a delegation, and model stream activity is not treated as a call.
- Station counters and a central context-usage indicator when usage is available.
- Activity feed with recent calls and durations.
- A Hermes Desktop side pane and a reduced-motion setting inherited from Panoptes.

The plugin listens to Desktop gateway events; it does not modify tool execution. The SVG drawing is an adapted lot-map renderer, bundled from the vendored MIT source at commit `5c5833d7380976fda671975d32fcec9c1bc3ef79`; the event bridge and feed are Panoptes-derived, not a feature-complete port.

### Event mapping and gaps

- `tool.start` / `tool.complete`: file tools → Files; terminal, execute_code, process_manage → Shell; web_search/web_extract → Web; browser_exec/browser_cdp/browser_dialog/browser_vault → Browser; delegate_task and cronjob variants → Agents; memory, hindsight_* and lcm_* → Memory; clarify and todo variants → You; all others, including MCP and skill tools → Skills. The gateway may suppress tool events when tool progress is disabled. Missing IDs/session IDs cannot be correlated and are ignored.
- `message.delta`, `reasoning.delta`, `thinking.delta`, `tool.generating` start an observed Model activity interval; further chunks do not restart it. A correlated `tool.start` or `message.complete` ends it and draws a return. These are observations, not API request boundaries or call counts; without stream events no model interval is invented. Tool events may be suppressed, and missing terminal events can leave an observation active. `session.info.model` and `session.usage.model` supply the displayed model and switch animation. `message.complete` marks an answer.
- `session.usage` supplies context_tokens/context_length, total_tokens and api_calls when present; `todo.updated` supplies only the count.
- `subagent.start` and terminal-status `subagent.complete` show a child at Agents when both have the same subagent_id and route; older events without identity or status are omitted. Child goals, text, tool previews and results are not retained. Other child events are not mapped because they do not provide a matching tool lifecycle.
- Hooks remain inactive: the inspected Desktop gateway event contract exposes no hook-execution event. No hook activity is inferred from unrelated events.

## Requirements and installation

The upstream plugin declares Hermes 0.21.7 or newer. Compatibility with all Desktop builds is not guaranteed.

Install the Desktop plugin from within Hermes Desktop:

1. Open **Settings → Plugins → Install from GitHub / Git URL**.
2. Enter `https://github.com/matroskin8/hermes-lot-map`.
3. If asked which components to install, select **Desktop**. If the backend component is already installed, it does not need to be replaced.
4. Open **Capabilities → Plugins** and enable **Hermes Lot Map** if needed. The pane appears in the workspace.

For a native Desktop connected to a remote backend, installing only on the backend with `hermes plugins install` does not install the Desktop UI on the local computer. Use the Desktop installation steps above. The plugin ID is `hermes-lot-map`, distinct from the original `panoptes`; coexistence has not been verified.

## Privacy and limitations

The Desktop event tap fans in multiple sessions, profiles and connections; the pane is not scoped to the selected conversation and events may be mixed. Completion correlation includes the event's available session, profile and connection tags, but that is not display isolation; absent tags and collisions remain a risk. Model names, tool names and aggregate activity are visible. Tool arguments, status text and child goals are not displayed or retained. Avoid sharing the pane if that visibility is unacceptable. Live Desktop event delivery, appearance and animation have not yet been verified. The adaptation has not received a security audit.

## Attribution and license

Based on [Panoptes](https://github.com/huwhitememes/panoptes) by Hu White, itself inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin. The original drawing code and its dependencies are vendored in `vendor/lot-map`; its MIT notice is in `vendor/lot-map/LICENSE`. Distributed under the **MIT License**; the upstream copyright and permission notices are preserved in [LICENSE](LICENSE).
