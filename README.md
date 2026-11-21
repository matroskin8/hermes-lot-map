# Hermes Lot Map

A live activity map for Hermes Desktop, based on [Panoptes](https://github.com/huwhitememes/panoptes) and visually inspired by [lot-map](https://github.com/alexeyw/lot-map). It shows a map beside the chat, with stations for tools, files, shell, web, browser, agents, memory, and user interaction.

> **Experimental:** the adapted rendering has been tested with simulated events and React server rendering, but not yet in a live Hermes Desktop session. Events from multiple sessions or connections may be mixed; session isolation has not been verified.

## Features

- Animated pulses for tool starts and completions; markers for failures.
- Station counters and a central context-usage indicator when usage is available.
- Activity feed with recent calls and durations.
- A Hermes Desktop side pane and a reduced-motion setting inherited from Panoptes.

The plugin listens to Desktop gateway events; it does not modify tool execution. It is a visual adaptation, not a feature-complete port of lot-map.

## Requirements and installation

The upstream plugin declares Hermes 0.21.7 or newer. Compatibility with a particular Desktop build and live session remains unverified for this adaptation.

This repository is experimental and has not been live-tested. Review the source and verify compatibility before installation. Its plugin ID is `hermes-lot-map`, distinct from the original `panoptes`. A Desktop restart or plugin reload may be needed.

## Tests

Run the event and component harness with Node.js:

```bash
node test/harness.mjs
```

To test server rendering with real React and nanostores, point `HERMES_DESKTOP_DIR` at a Desktop checkout with its dependencies installed:

```bash
HERMES_DESKTOP_DIR=/path/to/hermes-agent/apps/desktop node test/render-harness.mjs
```

The harness simulates events and does not establish end-to-end Desktop behavior or session isolation.

## Privacy and limitations

The inherited event handler processes gateway events, including tool arguments used for short activity labels. Avoid assuming these labels are safe for screenshots or screen sharing. Review `desktop/plugin.js` before installing. The adaptation has not received a security audit.

## Attribution and license

Based on [Panoptes](https://github.com/huwhitememes/panoptes) by Hu White, itself inspired by [lot-map](https://github.com/alexeyw/lot-map) by Aleksei Volodin. The visual adaptation was independently recreated from lot-map screenshots. Distributed under the **MIT License**; the upstream copyright and permission notices are preserved in [LICENSE](LICENSE).
