/**
 * Panoptes for Hermes Desktop — a live map of the work in a pane at the
 * workspace's right edge. Native re-implementation of the Claude Code
 * "lot-map" concept (https://github.com/alexeyw/lot-map, MIT) against the
 * Hermes desktop plugin contract: gateway events drive a station map.
 *
 *   tool.start / tool.complete  -> pulses out to a station and back
 *   message.delta               -> the model core glows while it thinks
 *   message.complete            -> answer ring out to YOU
 *   subagent.*                  -> the AGENTS station works
 *   session.usage               -> the context ring around the core
 *   status.update / todo.updated-> the "now" line and the task count
 *
 * Runtime door: ~/.hermes/desktop-plugins/panoptes/plugin.js — plain ESM,
 * imports limited to @hermes/plugin-sdk and react/jsx-runtime. Hot-reloaded;
 * rewrite this file and the pane reloads cleanly.
 *
 * JSX RULES (learned the hard way, on this file's first boot):
 *   1. Children go in config.children — the third parameter is the KEY,
 *      never text. Text as arg 3 silently renders empty elements.
 *   2. config must never be null — React 19's dev jsx reads config.children
 *      unguarded and crashes.
 *   3. Keys go in as the third parameter, not inside config — the dev
 *      runtime warns "key prop is being spread into JSX" on every render.
 */

import { atom, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

// Vendored lot-map 5c5833d; MIT, copyright Aleksei Volodin.
var LotMapOriginal = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // vendor/lot-map/hooks/draw.ts
  var draw_exports = {};
  __export(draw_exports, {
    ALARM_MS: () => ALARM_MS,
    DONE_MS: () => DONE_MS,
    GLOW_MS: () => GLOW_MS,
    MAP_ASPECT: () => MAP_ASPECT,
    PULSE_MS: () => PULSE_MS,
    SWITCH_MS: () => SWITCH_MS,
    TRAIL_FADE_MS: () => TRAIL_FADE_MS,
    TRAIL_HOLD_MS: () => TRAIL_HOLD_MS,
    drawMap: () => drawMap,
    routeOf: () => routeOf
  });

  // vendor/lot-map/hooks/classify.ts
  function shortModel(model) {
    const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
    return m === null ? model : `${m[1]} ${m[2]}${m[3] !== void 0 ? `.${m[3]}` : ""}`;
  }
  function formatTokens(tokens) {
    const n = Math.max(0, Math.round(tokens));
    if (n < 1e3) return String(n);
    const k = Math.round(n / 1e3);
    return k < 1e3 ? `${k}k` : `${Math.round(n / 1e6)}M`;
  }

  // vendor/lot-map/hooks/palette.ts
  var DARK = {
    ground: "#0a0c11",
    raised: "#12151c",
    line: "#272c36",
    spoke: "#1a1e27",
    bone: "#ebe6dc",
    ash: "#9ba1ab",
    dim: "#6b7280",
    accent: "#e1ac6e",
    hot: "#f0c595",
    red: "#e8654f",
    mem: "#62c7ba",
    memHot: "#a5e6dc",
    // One step away from `bone`, so that the light rules can give the route a color of its own.
    trail: "#ebe6dd"
  };
  var LIGHT = {
    ground: "#f5f2ea",
    raised: "#ffffff",
    line: "#cfc9bc",
    spoke: "#e3ded2",
    bone: "#1f2228",
    ash: "#5f6570",
    dim: "#8b909a",
    accent: "#b8762a",
    hot: "#8f560f",
    red: "#c5402b",
    mem: "#1c8c81",
    memHot: "#136a62",
    trail: "#9c978b"
  };
  var lightRules = (own = {}) => `<style>@media (prefers-color-scheme: light){${Object.keys(DARK).filter((k) => own[k] === void 0 && !Object.values(own).includes(DARK[k])).map((k) => `[fill="${DARK[k]}"]{fill:${LIGHT[k]}}[stroke="${DARK[k]}"]{stroke:${LIGHT[k]}}`).join("")}}</style>`;

  // vendor/lot-map/hooks/setup.ts
  var STATIONS = [
    { id: "you", icon: `${ring(0, -3.6, 3.4)}M-6.5 8c0-4 3-6.2 6.5-6.2s6.5 2.2 6.5 6.2` },
    { id: "model", icon: "M-5 -5h10v10h-10zM-2 -8.5v3.5M2 -8.5v3.5M-2 5v3.5M2 5v3.5M-8.5 -2h3.5M-8.5 2h3.5M5 -2h3.5M5 2h3.5" },
    { id: "memory", icon: `M-5 4.5L0 -5L6 3.5M-5 4.5L6 3.5${ring(-5, 4.5, 2.1)}${ring(0, -5, 2.1)}${ring(6, 3.5, 2.1)}` },
    { id: "files", icon: "M-5.5 -8h7.5l3.5 3.5v12.5h-11zM2 -8v3.5h3.5" },
    { id: "shell", icon: "M-7.5 -5l5 5l-5 5M0 6h7.5" },
    { id: "web", icon: `${ring(0, 0, 7.8)}M-7.8 0h15.6M0 -7.8c-4.2 4.2 -4.2 11.4 0 15.6M0 -7.8c4.2 4.2 4.2 11.4 0 15.6` },
    { id: "browser", icon: "M-8.5 -6.5h17v13h-17zM-8.5 -2.8h17M-6.3 -4.7h.1M-3.8 -4.7h.1" },
    { id: "agents", icon: `M0 -4v3.5M0 -.5L-6 4M0 -.5L6 4${ring(0, -6, 2.1)}${ring(-6.5, 5.5, 2.1)}${ring(6.5, 5.5, 2.1)}` },
    { id: "skills", icon: "M1.5 -8.5L-5.5 1h4.5l-1.5 7.5l7.5 -9.8h-4.5z" },
    { id: "hooks", icon: `M2.5 -5.5v8a4.2 4.2 0 1 1 -8.4 0v-1.5${ring(2.5, -7.3, 1.8)}` }
  ];
  function ring(x, y, r) {
    return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }

  // vendor/lot-map/hooks/draw.ts
  var W = 460;
  var H = 430;
  var MAP_ASPECT = H / W;
  var CX = 230;
  var CY = 212;
  var RX = 176;
  var RY = 164;
  var NODE = 22;
  var CORE = 40;
  var HUB = CORE + 8;
  var FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"';
  var PULSE_MS = 800;
  var RIPPLE_MS = 450;
  var GLOW_MS = 3200;
  var ALARM_MS = 6e3;
  var SWITCH_MS = 8e3;
  var DONE_MS = 1100;
  var TRAIL_STOPS = 7;
  var TRAIL_HOLD_MS = PULSE_MS;
  var TRAIL_FADE_MS = 6e4;
  var turn = (i, shift) => (i + shift) * 2 * Math.PI / STATIONS.length;
  var at = (a, f = 1) => ({ x: CX + RX * f * Math.sin(a), y: CY - RY * f * Math.cos(a) });
  var place = (i, shift) => at(turn(i, shift));
  var indexOf = (id) => STATIONS.findIndex((s) => s.id === id);
  var n1 = (v) => (Math.round(v * 10) / 10).toString();
  var clock = (ms) => `${(ms / 1e3).toFixed(3)}s`;
  function edge(from, to, r) {
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + (to.x - from.x) * r / d, y: from.y + (to.y - from.y) * r / d };
  }
  function aside(a, b, off) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = -(b.y - a.y) * off / d;
    const dy = (b.x - a.x) * off / d;
    return [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }];
  }
  // Precomputed, collision-tested candidates from the debug route geometry.
  const ROUTES = {"0:hermes:you":["M260.5 181.69 L265.99 169.54 L274.78 154.52 L284.77 137.5 L284.28 119.32 L271.98 100.83 L258.83 82.88 L248.44 66.33","M199.5 181.69 L190.53 169.54 L178.74 154.52 L174.67 137.5 L183.23 119.32 L194.7 100.83 L201.66 82.88 L211.56 66.33","M249.6 173.73 L252.91 164.54 L260.82 151.74 L262.68 136.39 L254.3 119.59 L245.88 102.4 L244.35 85.89 L241.85 71.14","M210.4 173.73 L210.91 164.54 L206.31 151.74 L197.94 136.39 L197.44 119.59 L206.78 102.4 L215.11 85.89 L218.15 71.14"],"0:hermes:model":["M272.62 206.3 L284.75 199.77 L301.36 193.04 L320.23 185.51 L331.38 170.47 L333.22 147.77 L334.1 125.01 L336.39 105.15","M268.8 193.47 L277.51 187.93 L292.16 182.42 L303.47 171.08 L307.41 152.12 L311.55 132.81 L320.86 118.41 L328.31 104.81","M238.51 169.85 L244.85 162.47 L249.3 149.01 L252.27 131.15 L262.52 117.11 L280.97 108.97 L298.17 100.72 L309.99 90.52","M272.94 214.19 L293.45 211.34 L308.31 201.14 L325.47 190.65 L343.41 179.59 L351.98 160.89 L348.63 133.46 L341.06 104.18"],"0:hermes:memory":["M268.49 231.18 L282.89 232.7 L301.17 236.81 L321.84 241.68 L340.46 235.63 L355.77 217.59 L370.35 199.02 L384.46 183.88","M272.49 218.59 L283.67 219.06 L299.76 223.12 L316.44 220.25 L331.37 206.5 L346.67 192.6 L363.44 185.95 L378.22 178.89","M261.7 182.95 L271.93 180.26 L284.08 171.33 L297.54 157.82 L314.84 151.92 L335.57 155.93 L355.31 159.1 L371.69 157.34","M264.31 237.92 L283.41 247.3 L302.14 247.22 L323.03 248.47 L344.98 249.88 L363.6 239.4 L377.41 214.58 L388.82 185.87"],"0:hermes:files":["M251.38 249.31 L262.53 258.56 L275.45 272.12 L289.95 287.64 L308.8 292.93 L331.55 286.41 L353.98 279.05 L374.12 274.28","M261.7 241.05 L270.74 247.64 L281.88 259.95 L297.35 266.81 L317.4 263.66 L337.84 260.57 L355.48 264.34 L371.69 266.66","M272.49 205.41 L282.49 208.85 L297.56 208.16 L316.25 204.38 L333.92 209.07 L348.94 223.91 L363.61 237.49 L378.22 245.11"],"0:hermes:shell":["M225.13 254.72 L228.51 268.08 L230.98 285.82 L233.69 305.97 L245.56 320.45 L267.13 327.77 L288.98 334.16 L307.68 341.23","M272.62 217.7 L287.57 222.04 L306.6 226.87 L320.68 238.14 L325.31 258.27 L327.82 280.45 L333.7 299.3 L336.39 318.85","M238.51 254.15 L241.76 263.95 L243.53 279.49 L251.78 293.23 L269.2 301.68 L286.91 310.4 L298.61 322.93 L309.99 333.48","M268.8 230.53 L274.42 238.48 L286.39 246.08 L302.98 253.31 L314.1 266.68 L317.5 286.55 L321.3 305.24 L328.31 319.19"],"0:hermes:web":["M199.5 242.31 L194.01 254.46 L185.22 269.48 L175.23 286.5 L175.72 304.68 L188.02 323.17 L201.17 341.12 L211.56 357.67","M260.5 242.31 L269.47 254.46 L281.26 269.48 L285.33 286.5 L276.77 304.68 L265.3 323.17 L258.34 341.12 L248.44 357.67","M210.4 250.27 L207.09 259.46 L199.18 272.26 L197.32 287.61 L205.7 304.41 L214.12 321.6 L215.65 338.11 L218.15 352.86","M249.6 250.27 L249.09 259.46 L253.69 272.26 L262.06 287.61 L262.56 304.41 L253.22 321.6 L244.89 338.11 L241.85 352.86"],"0:hermes:browser":["M187.38 217.7 L175.25 224.23 L158.64 230.96 L139.77 238.49 L128.62 253.53 L126.78 276.23 L125.9 298.99 L123.61 318.85","M234.87 254.72 L234.3 270.28 L234.26 289.91 L226.76 306.32 L208.37 315.71 L187.47 323.55 L170.62 333.85 L152.32 341.23","M191.2 230.53 L182.49 236.07 L167.84 241.58 L156.53 252.92 L152.59 271.88 L148.45 291.19 L139.14 305.59 L131.69 319.19","M221.49 254.15 L215.15 261.53 L210.7 274.99 L207.73 292.85 L197.48 306.89 L179.03 315.03 L161.83 323.28 L150.01 333.48"],"0:hermes:agents":["M208.62 249.31 L198.55 262.11 L186.55 278.74 L170.22 288.21 L148.88 285.27 L126.38 279.6 L105.87 278.55 L85.88 274.28","M187.51 205.41 L176.33 204.94 L160.24 200.88 L143.56 203.75 L128.63 217.5 L113.33 231.4 L96.56 238.05 L81.78 245.11","M198.3 241.05 L188.07 243.74 L175.92 252.67 L162.46 266.18 L145.16 272.08 L124.43 268.07 L104.69 264.9 L88.31 266.66","M215.83 252.6 L206.95 276.97 L192.88 292.46 L173.11 294.9 L151.43 294.4 L130.56 297.43 L108.52 295.06 L83.36 278.35"],"0:hermes:skills":["M191.51 231.18 L176.03 236.25 L156.83 243.43 L137.99 242.25 L121.86 227.97 L106.29 210.77 L89.8 198.52 L75.54 183.88","M198.3 182.95 L189.26 176.36 L178.12 164.05 L162.65 157.19 L142.6 160.34 L122.16 163.43 L104.52 159.66 L88.31 157.34","M187.51 218.59 L177.51 215.15 L162.44 215.84 L143.75 219.62 L126.08 214.93 L111.06 200.09 L96.39 186.51 L81.78 178.89","M195.69 237.92 L174.78 253.27 L154.49 258.36 L136.68 249.43 L118.92 236.98 L99.87 227.92 L82.85 213.73 L71.18 185.87"],"0:hermes:hooks":["M187.38 206.3 L172.43 201.96 L153.4 197.13 L139.32 185.86 L134.69 165.73 L132.18 143.55 L126.3 124.7 L123.61 105.15","M221.49 169.85 L218.24 160.05 L216.47 144.51 L208.22 130.77 L190.8 122.32 L173.09 113.6 L161.39 101.07 L150.01 90.52","M191.2 193.47 L185.58 185.52 L173.61 177.92 L157.02 170.69 L145.9 157.32 L142.5 137.45 L138.7 118.76 L131.69 104.81","M187.06 214.19 L161.82 215.03 L142.86 208.02 L133.77 191.25 L126.81 171.61 L117.12 153.8 L112.04 132.94 L118.94 104.18"],"0:agents:you":["M83.94 247.8 L108.32 229.26 L138.62 212.57 L162.37 189.12 L174.42 156.0 L185.96 123.03 L204.51 97.19 L220.77 72.31","M82.38 245.79 L95.0 235.0 L110.0 220.0 L130.0 180.0 L160.0 150.0 L175.0 135.0 L195.0 95.0 L214.47 68.85"],"0:agents:model":["M79.84 243.21 L109.2 220.0 L136.8 190.25 L162.87 155.88 L195.98 131.14 L236.89 118.7 L275.98 105.94 L308.97 88.08","M86.64 272.61 L153.01 296.83 L210.6 305.86 L252.05 289.71 L281.72 255.7 L308.03 217.18 L328.4 171.23 L333.74 105.32"],"0:agents:memory":["M87.4 270.55 L133.7 278.66 L178.16 274.21 L224.48 272.02 L271.48 270.78 L313.52 254.43 L348.88 219.91 L381.13 181.61","M85.88 274.28 L136.87 294.59 L183.54 294.95 L229.47 289.44 L276.29 285.71 L319.39 270.86 L354.73 233.77 L384.46 183.88"],"0:agents:files":["M85.94 274.17 L125.06 285.15 L166.22 300.17 L208.6 316.55 L251.4 317.71 L293.78 302.07 L334.94 285.73 L374.06 274.17","M87.83 269.01 L126.25 277.33 L166.87 291.29 L208.81 295.76 L251.19 284.9 L293.13 273.57 L333.75 271.98 L372.17 269.01"],"0:agents:shell":["M88.61 262.82 L119.1 269.53 L153.57 270.63 L190.67 267.52 L224.77 275.83 L254.27 297.84 L282.92 318.14 L311.74 330.37","M87.58 269.94 L105.0 275.0 L145.0 285.0 L185.0 300.0 L225.0 310.0 L265.0 325.0 L305.0 335.0 L308.84 336.3"],"0:agents:web":["M88.51 260.36 L114.14 260.6 L142.75 259.58 L166.63 267.45 L181.92 288.61 L194.93 312.53 L210.33 331.03 L222.54 351.09","M88.09 267.88 L105.82 277.21 L128.39 283.14 L154.28 286.43 L174.83 298.35 L188.07 320.3 L200.92 340.61 L215.71 354.28","M87.63 255.6 L121.45 246.01 L149.62 247.37 L169.13 263.1 L186.63 282.31 L206.31 297.78 L221.94 317.67 L227.28 350.14","M86.29 251.93 L126.4 235.15 L156.83 234.79 L178.96 247.97 L200.28 262.76 L220.63 278.55 L231.78 306.67 L231.18 350.03"],"0:agents:browser":["M53.79 287.14 L51.92 300.87 L50.73 315.61 L50.85 330.25 L57.75 339.92 L71.66 343.81 L86.7 345.89 L100.68 347.27","M88.48 260.09 L104.0 260.26 L120.09 261.53 L131.29 267.53 L134.96 279.72 L135.75 293.84 L137.2 306.52 L135.37 320.22","M62.17 288.67 L63.16 297.17 L63.48 308.42 L67.96 317.79 L78.18 323.12 L88.55 327.89 L95.09 334.3 L101.23 338.78","M87.94 268.58 L94.02 273.1 L103.2 277.45 L114.45 281.54 L121.57 289.29 L123.21 300.86 L124.43 311.42 L127.0 318.68"],"0:agents:skills":["M84.77 249.07 L94.69 239.67 L104.6 229.08 L113.36 217.77 L113.86 206.23 L105.42 194.92 L94.93 184.33 L84.77 174.93","M40.46 249.07 L28.39 239.67 L16.62 229.08 L11.52 217.77 L16.0 206.23 L23.94 194.92 L30.6 184.33 L40.46 174.93","M79.2 242.66 L83.55 235.65 L90.06 226.89 L92.23 217.08 L87.57 206.92 L82.46 197.11 L81.26 188.35 L79.2 181.34","M46.02 242.66 L44.04 235.65 L39.58 226.89 L33.38 217.08 L32.55 206.92 L38.23 197.11 L43.63 188.35 L46.02 181.34"],"0:agents:hooks":["M85.03 249.51 L101.09 233.56 L120.57 216.97 L141.17 199.67 L149.79 177.83 L144.99 151.67 L139.03 126.2 L135.92 103.57","M87.08 253.89 L112.78 239.94 L128.49 220.98 L145.86 201.7 L163.47 182.2 L167.95 158.42 L156.44 129.98 L140.25 101.42"],"5:hermes:you":["M199.5 242.31 L194.01 254.46 L185.22 269.48 L175.23 286.5 L175.72 304.68 L188.02 323.17 L201.17 341.12 L211.56 357.67","M260.5 242.31 L269.47 254.46 L281.26 269.48 L285.33 286.5 L276.77 304.68 L265.3 323.17 L258.34 341.12 L248.44 357.67","M210.4 250.27 L207.09 259.46 L199.18 272.26 L197.32 287.61 L205.7 304.41 L214.12 321.6 L215.65 338.11 L218.15 352.86","M249.6 250.27 L249.09 259.46 L253.69 272.26 L262.06 287.61 L262.56 304.41 L253.22 321.6 L244.89 338.11 L241.85 352.86"],"5:hermes:model":["M187.38 217.7 L175.25 224.23 L158.64 230.96 L139.77 238.49 L128.62 253.53 L126.78 276.23 L125.9 298.99 L123.61 318.85","M234.87 254.72 L234.3 270.28 L234.26 289.91 L226.76 306.32 L208.37 315.71 L187.47 323.55 L170.62 333.85 L152.32 341.23","M191.2 230.53 L182.49 236.07 L167.84 241.58 L156.53 252.92 L152.59 271.88 L148.45 291.19 L139.14 305.59 L131.69 319.19","M221.49 254.15 L215.15 261.53 L210.7 274.99 L207.73 292.85 L197.48 306.89 L179.03 315.03 L161.83 323.28 L150.01 333.48"],"5:hermes:memory":["M208.62 249.31 L198.55 262.11 L186.55 278.74 L170.22 288.21 L148.88 285.27 L126.38 279.6 L105.87 278.55 L85.88 274.28","M187.51 205.41 L176.33 204.94 L160.24 200.88 L143.56 203.75 L128.63 217.5 L113.33 231.4 L96.56 238.05 L81.78 245.11","M198.3 241.05 L188.07 243.74 L175.92 252.67 L162.46 266.18 L145.16 272.08 L124.43 268.07 L104.69 264.9 L88.31 266.66","M215.83 252.6 L206.95 276.97 L192.88 292.46 L173.11 294.9 L151.43 294.4 L130.56 297.43 L108.52 295.06 L83.36 278.35"],"5:hermes:files":["M191.51 231.18 L176.03 236.25 L156.83 243.43 L137.99 242.25 L121.86 227.97 L106.29 210.77 L89.8 198.52 L75.54 183.88","M198.3 182.95 L189.26 176.36 L178.12 164.05 L162.65 157.19 L142.6 160.34 L122.16 163.43 L104.52 159.66 L88.31 157.34","M187.51 218.59 L177.51 215.15 L162.44 215.84 L143.75 219.62 L126.08 214.93 L111.06 200.09 L96.39 186.51 L81.78 178.89","M195.69 237.92 L174.78 253.27 L154.49 258.36 L136.68 249.43 L118.92 236.98 L99.87 227.92 L82.85 213.73 L71.18 185.87"],"5:hermes:shell":["M187.38 206.3 L172.43 201.96 L153.4 197.13 L139.32 185.86 L134.69 165.73 L132.18 143.55 L126.3 124.7 L123.61 105.15","M221.49 169.85 L218.24 160.05 L216.47 144.51 L208.22 130.77 L190.8 122.32 L173.09 113.6 L161.39 101.07 L150.01 90.52","M191.2 193.47 L185.58 185.52 L173.61 177.92 L157.02 170.69 L145.9 157.32 L142.5 137.45 L138.7 118.76 L131.69 104.81","M187.06 214.19 L161.82 215.03 L142.86 208.02 L133.77 191.25 L126.81 171.61 L117.12 153.8 L112.04 132.94 L118.94 104.18"],"5:hermes:web":["M260.5 181.69 L265.99 169.54 L274.78 154.52 L284.77 137.5 L284.28 119.32 L271.98 100.83 L258.83 82.88 L248.44 66.33","M199.5 181.69 L190.53 169.54 L178.74 154.52 L174.67 137.5 L183.23 119.32 L194.7 100.83 L201.66 82.88 L211.56 66.33","M249.6 173.73 L252.91 164.54 L260.82 151.74 L262.68 136.39 L254.3 119.59 L245.88 102.4 L244.35 85.89 L241.85 71.14","M210.4 173.73 L210.91 164.54 L206.31 151.74 L197.94 136.39 L197.44 119.59 L206.78 102.4 L215.11 85.89 L218.15 71.14"],"5:hermes:browser":["M272.62 206.3 L284.75 199.77 L301.36 193.04 L320.23 185.51 L331.38 170.47 L333.22 147.77 L334.1 125.01 L336.39 105.15","M268.8 193.47 L277.51 187.93 L292.16 182.42 L303.47 171.08 L307.41 152.12 L311.55 132.81 L320.86 118.41 L328.31 104.81","M238.51 169.85 L244.85 162.47 L249.3 149.01 L252.27 131.15 L262.52 117.11 L280.97 108.97 L298.17 100.72 L309.99 90.52","M272.94 214.19 L293.45 211.34 L308.31 201.14 L325.47 190.65 L343.41 179.59 L351.98 160.89 L348.63 133.46 L341.06 104.18"],"5:hermes:agents":["M268.49 231.18 L282.89 232.7 L301.17 236.81 L321.84 241.68 L340.46 235.63 L355.77 217.59 L370.35 199.02 L384.46 183.88","M272.49 218.59 L283.67 219.06 L299.76 223.12 L316.44 220.25 L331.37 206.5 L346.67 192.6 L363.44 185.95 L378.22 178.89","M261.7 182.95 L271.93 180.26 L284.08 171.33 L297.54 157.82 L314.84 151.92 L335.57 155.93 L355.31 159.1 L371.69 157.34","M264.31 237.92 L283.41 247.3 L302.14 247.22 L323.03 248.47 L344.98 249.88 L363.6 239.4 L377.41 214.58 L388.82 185.87"],"5:hermes:skills":["M251.38 249.31 L262.53 258.56 L275.45 272.12 L289.95 287.64 L308.8 292.93 L331.55 286.41 L353.98 279.05 L374.12 274.28","M261.7 241.05 L270.74 247.64 L281.88 259.95 L297.35 266.81 L317.4 263.66 L337.84 260.57 L355.48 264.34 L371.69 266.66","M272.49 205.41 L282.49 208.85 L297.56 208.16 L316.25 204.38 L333.92 209.07 L348.94 223.91 L363.61 237.49 L378.22 245.11"],"5:hermes:hooks":["M225.13 254.72 L228.51 268.08 L230.98 285.82 L233.69 305.97 L245.56 320.45 L267.13 327.77 L288.98 334.16 L307.68 341.23","M272.62 217.7 L287.57 222.04 L306.6 226.87 L320.68 238.14 L325.31 258.27 L327.82 280.45 L333.7 299.3 L336.39 318.85","M238.51 254.15 L241.76 263.95 L243.53 279.49 L251.78 293.23 L269.2 301.68 L286.91 310.4 L298.61 322.93 L309.99 333.48","M268.8 230.53 L274.42 238.48 L286.39 246.08 L302.98 253.31 L314.1 266.68 L317.5 286.55 L321.3 305.24 L328.31 319.19"],"5:agents:you":["M376.06 176.2 L351.68 194.74 L321.38 211.43 L297.63 234.88 L285.58 268.0 L274.04 300.97 L255.49 326.81 L239.23 351.69","M380.98 181.49 L370.0 195.0 L345.0 230.0 L320.0 260.0 L295.0 295.0 L270.0 325.0 L246.05 355.54"],"5:agents:model":["M384.73 184.03 L362.13 218.55 L339.75 257.0 L309.92 286.63 L269.51 301.35 L227.22 312.57 L189.89 328.93 L152.34 341.36","M380.16 180.79 L350.8 204.0 L323.2 233.75 L297.13 268.12 L264.02 292.86 L223.11 305.3 L184.02 318.06 L151.03 335.92"],"5:agents:memory":["M384.46 183.88 L354.59 233.32 L317.07 263.2 L273.6 276.83 L229.58 289.8 L185.79 302.37 L138.11 298.69 L85.88 274.28","M372.64 169.31 L355.0 175.0 L325.0 200.0 L295.0 230.0 L265.0 260.0 L240.0 270.0 L210.0 270.0 L165.0 265.0 L120.0 265.0 L88.59 263.73"],"5:agents:files":["M382.82 182.86 L340.43 230.55 L296.77 262.02 L252.34 288.32 L207.66 299.14 L163.23 279.67 L119.57 235.88 L77.18 182.86","M371.4 160.51 L355.0 160.0 L310.0 160.0 L265.0 160.0 L230.0 150.0 L190.0 160.0 L145.0 160.0 L100.0 160.0 L88.6 160.4"],"5:agents:shell":["M371.39 161.18 L340.9 154.47 L306.43 153.37 L269.33 156.48 L235.23 148.17 L205.73 126.16 L177.08 105.86 L148.26 93.63","M372.27 154.61 L355.0 150.0 L315.0 140.0 L290.0 140.0 L255.0 120.0 L215.0 110.0 L180.0 105.0 L149.99 90.58"],"5:agents:web":["M371.49 163.64 L345.86 163.4 L317.25 164.42 L293.37 156.55 L278.08 135.39 L265.07 111.47 L249.67 92.97 L237.46 72.91","M372.37 168.4 L338.55 177.99 L310.38 176.63 L290.87 160.9 L273.37 141.69 L253.69 126.22 L238.06 106.33 L232.72 73.86","M398.57 135.35 L397.12 95.03 L384.3 69.37 L367.49 48.34 L350.79 26.72 L328.06 14.44 L294.01 20.14 L253.68 37.25","M373.71 172.07 L333.6 188.85 L303.17 189.21 L281.04 176.03 L259.72 161.24 L239.37 145.45 L228.22 117.33 L228.82 73.97"],"5:agents:browser":["M406.21 136.86 L408.08 123.13 L409.27 108.39 L409.15 93.75 L402.25 84.08 L388.34 80.19 L373.3 78.11 L359.32 76.73","M371.52 163.91 L356.0 163.74 L339.91 162.47 L328.71 156.47 L325.04 144.28 L324.25 130.16 L322.8 117.48 L324.63 103.78","M397.83 135.33 L396.84 126.83 L396.52 115.58 L392.04 106.21 L381.82 100.88 L371.45 96.11 L364.91 89.7 L358.77 85.22","M372.06 155.42 L365.98 150.9 L356.8 146.55 L345.55 142.46 L338.43 134.71 L336.79 123.14 L335.57 112.58 L333.0 105.32"],"5:agents:skills":["M375.23 174.93 L365.31 184.33 L355.4 194.92 L346.64 206.23 L346.14 217.77 L354.58 229.08 L365.07 239.67 L375.23 249.07","M419.54 174.93 L431.61 184.33 L443.38 194.92 L448.48 206.23 L444.0 217.77 L436.06 229.08 L429.4 239.67 L419.54 249.07","M380.8 181.34 L376.45 188.35 L369.94 197.11 L367.77 206.92 L372.43 217.08 L377.54 226.89 L378.74 235.65 L380.8 242.66","M413.98 181.34 L415.96 188.35 L420.42 197.11 L426.62 206.92 L427.45 217.08 L421.77 226.89 L416.37 235.65 L413.98 242.66"],"5:agents:hooks":["M374.97 174.49 L358.91 190.44 L339.43 207.03 L318.83 224.33 L310.21 246.17 L315.01 272.33 L320.97 297.8 L324.08 320.43","M379.78 180.45 L367.17 196.01 L349.48 211.99 L338.73 231.73 L339.71 256.0 L341.19 280.0 L335.5 300.17 L331.56 318.75","M372.92 170.11 L347.22 184.06 L331.51 203.02 L314.14 222.3 L296.53 241.8 L292.05 265.58 L303.56 294.02 L319.75 322.58"]};
  function eventPath(e, shift, reverse = false) {
    const origin = e.from === "agents" ? "agents" : "hermes";
    const options = ROUTES[`${shift}:${origin}:${e.station}`];
    if (!options || !options.length) return null;
    let hash = 2166136261;
    for (const ch of String(e.id)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    const path = options[hash % options.length];
    if (!reverse) return path;
    const points = path.match(/-?(?:\d+\.?\d*|\.\d+)/g).map(Number);
    const pairs = [];
    for (let i = 0; i < points.length; i += 2) pairs.push(`${points[i]} ${points[i+1]}`);
    pairs.reverse();
    return `M${pairs[0]}` + pairs.slice(1).map(p => ` L${p}`).join('');
  }
  function pulse(path, color, age, radius, isHollow = false) {
    if (!path) return "";
    let out = "";
    for (let k = isHollow ? 0 : 2; k >= 0; k--) {
      const timing = `begin="${clock(k * 45 - age)}" dur="${clock(PULSE_MS)}" fill="freeze"`;
      const peak = n1(1 - 0.36 * k);
      const paint = isHollow ? `fill="none" stroke="${color}" stroke-width="1.4"` : `fill="${color}"`;
      out += `<circle r="${n1(radius * (1 - 0.27 * k))}" ${paint} opacity="0"><animateMotion path="${path}" ${timing}/><animate attributeName="opacity" values="${peak};${peak};0" keyTimes="0;.82;1" ${timing}/></circle>`;
    }
    return out;
  }
  function ripple(p, r, color, age) {
    const timing = `begin="${clock(PULSE_MS - age)}" dur="${clock(RIPPLE_MS)}" fill="freeze"`;
    return `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0"><animate attributeName="r" values="${r};${r + 11}" ${timing}/><animate attributeName="opacity" values=".7;0" ${timing}/></circle>`;
  }
  function beam(a, b, color, age, isDashed) {
    return `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ""} opacity="0"><animate attributeName="opacity" values=".75;0" begin="${clock(-age)}" dur="${clock(GLOW_MS / 2)}" fill="freeze"/></line>`;
  }
  var BEND = [0.5, 0.5, 0.4, 0.45, 0.55, 0.75];
  function leg(i, j, shift) {
    const n = STATIONS.length;
    let steps = ((j - i) % n + n) % n;
    if (steps > n / 2) steps -= n;
    const bend = at(turn(i + steps / 2, shift), BEND[Math.abs(steps)] ?? 0.5);
    const a = edge(place(i, shift), bend, NODE + 4);
    const b = edge(place(j, shift), bend, NODE + 4);
    return { path: `M${n1(a.x)} ${n1(a.y)}Q${n1(bend.x)} ${n1(bend.y)} ${n1(b.x)} ${n1(b.y)}`, end: b };
  }
  function routeOf(entries, max = TRAIL_STOPS) {
    const stops = [];
    for (const e of entries) {
      if (e.from === "agents" || e.station === "model") continue;
      const last = stops[stops.length - 1];
      if (last === void 0 || last.station !== e.station) stops.push({ station: e.station, at: e.startedAt });
    }
    return stops.slice(-max);
  }
  function trail(entries, now, c, isStill, shift) {
    const stops = routeOf(entries);
    let out = "";
    for (let k = 1; k < stops.length; k++) {
      const from = stops[k - 1];
      const to = stops[k];
      if (from === void 0 || to === void 0) continue;
      const { path, end } = leg(indexOf(from.station), indexOf(to.station), shift);
      const isHead = k === stops.length - 1;
      const age = now - to.at;
      if (age >= TRAIL_HOLD_MS + TRAIL_FADE_MS) continue;
      const opacity = n1(0.12 + 0.5 * k / (stops.length - 1));
      const fade = `<animate data-lm-key="fade" attributeName="opacity" values="${opacity};0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/>`;
      const drawing = isHead && !isStill ? ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate data-lm-key="draw" attributeName="stroke-dashoffset" values="1;0" begin="${clock(to.at - now)}" dur=".5s" fill="freeze"/>` : ">";
      const key = escapeXml(`${from.station}-${from.at}-${to.station}-${to.at}`);
      out += `<path data-lm-key="leg-${key}" d="${path}" fill="none" stroke="${c.trail}" stroke-width="${isHead ? 1.5 : 1.1}" stroke-linecap="round" opacity="${opacity}"${drawing}${fade}</path>`;
      if (isHead) {
        out += `<circle data-lm-key="tip-${key}" cx="${n1(end.x)}" cy="${n1(end.y)}" r="2.4" fill="${c.trail}" opacity="${isStill ? ".85" : "0"}">` + (isStill ? "" : `<animate attributeName="opacity" values="0;.85" begin="${clock(to.at - now + 400)}" dur=".15s" fill="freeze"/>`) + `<animate attributeName="opacity" values=".85;0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/></circle>`;
      }
    }
    return out;
  }
  function station(s, i, { entries, board, now, c, names, isStill, shift, spent }) {
    const p = place(i, shift);
    const x = n1(p.x);
    const y = n1(p.y);
    const count = board.counts[s.id] ?? 0;
    const own = entries.filter((e) => e.station === s.id);
    const running = own.filter((e) => e.status === "run");
    const latest = own.length > 0 ? own[own.length - 1] : void 0;
    const since = latest === void 0 ? Infinity : now - (latest.endedAt ?? latest.startedAt);
    const alarm = own.filter((e) => e.status === "block" || e.status === "err").pop();
    const alarmAge = alarm === void 0 ? Infinity : now - (alarm.endedAt ?? alarm.startedAt);
    const isAlarm = alarmAge < ALARM_MS;
    const isLit = running.length > 0 || since < GLOW_MS;
    const [main, hot] = s.id === "memory" ? [c.mem, c.memHot] : [c.accent, c.hot];
    const color = isAlarm ? c.red : main;
    const fade = isAlarm ? alarmAge : since;
    const span = isAlarm ? ALARM_MS : GLOW_MS;
    let under = "";
    if (isLit || isAlarm) {
      under += running.length > 0 && !isAlarm ? `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity=".16"/>` : `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity="0"><animate attributeName="opacity" values=".3;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`;
    }
    if (running.length > 0) {
      const elapsed = now - Math.min(...running.map((e) => e.startedAt));
      const beat = `begin="${clock(-(elapsed % 1400))}" dur="1.4s" repeatCount="indefinite"`;
      if (!isStill) {
        under += `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.3"><animate attributeName="r" values="${NODE};${NODE + 15}" ${beat}/><animate attributeName="opacity" values=".9;0" ${beat}/></circle>`;
      }
      const hand = (r, width, lapMs, isOnce) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${hot}" stroke-width="${width}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${x} ${y})"><animate data-lm-key="draw" attributeName="stroke-dashoffset" values="1;0" begin="${clock(-(isOnce ? Math.min(elapsed, lapMs) : elapsed % lapMs))}" dur="${clock(lapMs)}" ${isOnce ? 'fill="freeze"' : 'repeatCount="indefinite"'}/></circle>`;
      under += hand(NODE + 4, 2.2, 6e4, false) + hand(NODE + 8, 1.2, 6e5, true);
    }
    const lit = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.2"`;
    const cooling = running.length > 0 ? `${lit}/>` : isLit || isAlarm ? `${lit} opacity="0"><animate attributeName="opacity" values="1;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>` : "";
    const glyphColor = isAlarm ? c.red : isLit ? hot : s.id === "memory" && count > 0 ? main : c.ash;
    const rim = `paint-order="stroke" stroke="${c.ground}" stroke-width="3.5" stroke-linejoin="round"`;
    let over = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="${c.raised}" stroke="${c.line}" stroke-width="1.2"/>${cooling}<path transform="translate(${x} ${y})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><text x="${x}" y="${n1(p.y + NODE + 15)}" text-anchor="middle" ${FONT} font-size="11.5" ${rim} fill="${isLit || isAlarm ? c.bone : c.ash}">${names[s.id]}</text>`;
    if (count > 0) {
      const pushed = s.id === "memory" ? Math.min(count, board.pushed ?? 0) : 0;
      const asked = count - pushed;
      const figures = pushed === 0 ? String(count) : `${asked > 0 ? `${asked} ` : ""}<tspan fill="${main}">\u2193${pushed}</tspan>`;
      const tokens = spent?.[s.id] ?? 0;
      const cost = tokens > 0 ? ` \xB7 ${formatTokens(tokens)}` : "";
      over += `<text x="${x}" y="${n1(p.y + NODE + 28)}" text-anchor="middle" ${FONT} font-size="9.5" ${rim} fill="${c.dim}">${figures}${cost}</text>`;
    }
    const corner = NODE * 0.74;
    if (running.length > 1) {
      over += `<circle cx="${n1(p.x + corner)}" cy="${n1(p.y - corner)}" r="8" fill="${c.raised}" stroke="${color}" stroke-width="1"/><text x="${n1(p.x + corner)}" y="${n1(p.y - corner + 3)}" text-anchor="middle" ${FONT} font-size="8.5" fill="${hot}">\xD7${running.length}</text>`;
    }
    const faults = board.faults?.[s.id] ?? 0;
    if (faults > 0) {
      over += `<circle cx="${n1(p.x - corner)}" cy="${n1(p.y - corner)}" r="7.5" fill="${c.red}"/><text x="${n1(p.x - corner)}" y="${n1(p.y - corner + 3.1)}" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="${c.ground}">${faults > 99 ? "99+" : faults}</text>`;
    }
    return { under, over };
  }
  function drawMap(board, now, setup) {
    const c = { ...setup.theme === "light" ? LIGHT : DARK, ...setup.colors };
    const shift = setup.layout === "you-bottom" ? STATIONS.length / 2 : 0;
    const core = { x: CX, y: CY };
    const recent = board.entries.filter((e, i) => e.status === "run" || i >= board.entries.length - 40);
    const isStill = setup.motion === "reduced";
    const flights = isStill ? [] : recent.filter((e) => now - e.startedAt < PULSE_MS + RIPPLE_MS).slice(-14);
    const returns = isStill ? [] : recent.filter((e) => e.endedAt !== void 0 && e.from !== "inbound" && now - e.endedAt < PULSE_MS + RIPPLE_MS).slice(-14);
    const beams = recent.filter((e) => now - e.startedAt < GLOW_MS / 2).slice(-10);
    const anyRunning = recent.some((e) => e.status === "run");
    const agentsAt = place(indexOf("agents"), shift);
    const isBad = (e) => e.status === "block" || e.status === "err";
    const tone = (e) => e.station === "memory" ? [c.mem, c.memHot] : [c.accent, c.hot];
    let body = setup.background === "transparent" ? "" : `<rect width="${W}" height="${H}" rx="12" fill="${c.ground}"/>`;
    for (const [rx, ry] of [[66, 62], [104, 97], [142, 132]]) {
      body += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.line}" stroke-width=".7" opacity=".45" stroke-dasharray="2 5"/>`;
    }
    const scene = { entries: recent, board, now, c, names: setup.t.stations, isStill, shift, spent: setup.contextCost ? board.spent : void 0 };
    const drawn = STATIONS.map((s, i) => station(s, i, scene));
    body += drawn.map((d, i) => `<g data-lm-key="under-${i}">${d.under}</g>`).join("");
    body += `<g data-lm-key="trail">${trail(recent, now, c, isStill, shift)}</g>`;
    const ends = (e) => {
      const p = place(indexOf(e.station), shift);
      const start = e.from === "agents" ? agentsAt : core;
      return [edge(start, p, e.from === "agents" ? NODE : HUB), edge(p, start, NODE)];
    };
    for (const e of flights) {
      const path = eventPath(e, shift, e.from === "inbound");
      const age = now - e.startedAt;
      const color = e.status === "block" ? c.red : tone(e)[1];
      body += `<g data-lm-key="flight-${escapeXml(String(e.id))}">`;
      if (e.from === "inbound") {
        body += pulse(path, color, age, 3.8, true) + ripple(core, HUB - 2, color, age);
      } else {
        body += pulse(path, color, age, 3.8) + ripple(place(indexOf(e.station), shift), NODE, color, age);
      }
      body += `</g>`;
    }
    for (const e of returns) {
      const path = eventPath(e, shift, true);
      body += `<g data-lm-key="return-${escapeXml(String(e.id))}">${pulse(path, e.status === "ok" ? c.ash : c.red, now - e.endedAt, 2.6)}</g>`;
    }
    body += drawn.map((d, i) => `<g data-lm-key="over-${i}">${d.over}</g>`).join("");
    // Cap each station at six; the station badge reports the full running count.
    for (const [i, s] of STATIONS.entries()) {
      const p = place(i, shift);
      const nearest = Math.min(Math.hypot(p.x - CX, p.y - CY), ...STATIONS.map((_, j) => j === i ? Infinity : Math.hypot(p.x - place(j, shift).x, p.y - place(j, shift).y)));
      const orbitRadius = Math.max(0, Math.min(NODE + 6, nearest / 2 - 4.75));
      const calls = board.entries.filter((e) => e.station === s.id && e.status === "run" && e.satellite !== false).slice(0, 6);
      for (const e of calls) {
        let hash = 0;
        for (const ch of String(e.id)) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
        hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
        hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
        hash = (hash ^ (hash >>> 16)) >>> 0;
        const lap = 7000;
        const spin = `${n1(p.x)} ${n1(p.y)}`;
        const dot = `<circle cx="${n1(p.x)}" cy="${n1(p.y - orbitRadius)}" r="3" fill="${s.id === "memory" ? c.memHot : c.hot}"/>`;
        const key = escapeXml(String(e.id));
        body += isStill ? `<g data-lm-key="satellite-${key}" transform="rotate(${n1((hash % lap) * 360 / lap)} ${spin})">${dot}</g>` : `<g data-lm-key="satellite-${key}"><animateTransform attributeName="transform" type="rotate" from="0 ${spin}" to="360 ${spin}" begin="${clock(-((now + hash % lap) % lap))}" dur="${clock(lap)}" repeatCount="indefinite"/>${dot}</g>`;
      }
    }
    const coreSize = Math.min(17, 62 / (0.75 * setup.core.length));
    const period = anyRunning ? 1600 : 4800;
    const breath = `begin="${clock(-(now % period))}" dur="${clock(period)}" repeatCount="indefinite"`;
    body += (isStill ? `<circle cx="${CX}" cy="${CY}" r="${CORE + 8}" fill="${c.accent}" opacity="${anyRunning ? ".16" : ".08"}"/>` : `<circle cx="${CX}" cy="${CY}" r="${CORE + 6}" fill="${c.accent}" opacity=".08"><animate attributeName="r" values="${CORE + 3};${CORE + 13};${CORE + 3}" ${breath}/><animate attributeName="opacity" values=".05;${anyRunning ? ".24" : ".12"};.05" ${breath}/></circle>`) + `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="${c.raised}" stroke="${anyRunning ? c.accent : c.line}" stroke-width="1.3"/>`;
    if (board.context !== void 0) {
      const full = Math.max(0, Math.min(100, Math.round(board.context)));
      const ring2 = `cx="${CX}" cy="${CY}" r="${CORE + 5}" fill="none" stroke-width="2.2"`;
      body += `<circle ${ring2} stroke="${c.line}" opacity=".7"/><circle ${ring2} stroke="${full >= 90 ? c.red : full >= 70 ? c.accent : c.ash}" pathLength="100" stroke-dasharray="${full} 100" transform="rotate(-90 ${CX} ${CY})"/><text x="${CX}" y="${CY - 19}" text-anchor="middle" ${FONT} font-size="8" fill="${c.dim}">${full}%</text>`;
    }
    const switchAge = board.switchedAt === void 0 ? Infinity : now - board.switchedAt;
    const isSwitching = switchAge >= 0 && switchAge < SWITCH_MS;
    body += `<text x="${CX}" y="${CY + (board.model === void 0 ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${c.bone}">${escapeXml(setup.core)}</text>`;
    if (board.model !== void 0) {
      body += `<text x="${CX}" y="${CY + 17}" text-anchor="middle" ${FONT} font-size="9" fill="${isSwitching ? c.hot : c.ash}">${escapeXml(shortModel(board.model))}</text>`;
    }
    if (isSwitching && !isStill) {
      const model = place(indexOf("model"), shift);
      const laps = Math.ceil((SWITCH_MS - switchAge) / 1600);
      for (const [p, r] of [[core, CORE], [model, NODE]]) {
        const ringing = `begin="${clock(-(switchAge % 1600))}" dur="1.6s" repeatCount="${laps}" fill="freeze"`;
        body += `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${c.bone}" stroke-width="1.4" opacity="0"><animate attributeName="r" values="${r};${r + 26}" ${ringing}/><animate attributeName="opacity" values=".7;0" ${ringing}/></circle>`;
      }
    }
    const done = recent.filter((e) => e.mark === "done").pop();
    if (done !== void 0 && now - done.startedAt < DONE_MS && !isStill) {
      const leaving = `begin="${clock(done.startedAt - now)}" dur="${clock(DONE_MS)}" fill="freeze"`;
      body += `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="none" stroke="${c.bone}" stroke-width="1.6" opacity="0"><animate attributeName="r" values="${CORE};${CORE + 38}" ${leaving}/><animate attributeName="opacity" values=".6;0" ${leaving}/></circle>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${setup.theme === "auto" ? lightRules(setup.colors) : ""}${body}</svg>`;
  }
  function escapeXml(text) {
    return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  }
  return __toCommonJS(draw_exports);
})();

var LotMapSetup = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // vendor/lot-map/hooks/setup.ts
  var setup_exports = {};
  __export(setup_exports, {
    STATIONS: () => STATIONS,
    setupFrom: () => setupFrom
  });

  // vendor/lot-map/hooks/classify.ts
  function cut(text, max) {
    if (text.length <= max) return text;
    const all = [...text];
    return all.length > max ? `${all.slice(0, max - 1).join("")}\u2026` : text;
  }
  function clean(label, max = 120) {
    const text = label.replace(/(?:(?![‌‍])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}])+/gu, " ").replace(/ {2,}/g, " ").trim();
    return cut(text, max);
  }

  // vendor/lot-map/hooks/palette.ts
  var COLOR_NAMES = {
    background: "ground",
    node: "raised",
    line: "line",
    spoke: "spoke",
    text: "bone",
    label: "ash",
    faint: "dim",
    accent: "accent",
    active: "hot",
    error: "red",
    memory: "mem",
    memoryActive: "memHot",
    route: "trail"
  };

  // vendor/lot-map/hooks/text.ts
  var en = {
    title: "Work map",
    command: "Open the work map beside the chat",
    opened: "Work map opened.",
    cannotOpen: (reason) => `Nowhere to show the map right now: ${reason}`,
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    hideMap: "Hide map",
    showMap: "Show map",
    stations: {
      you: "You",
      model: "Model",
      memory: "Memory",
      files: "Files",
      shell: "Shell",
      web: "Network",
      browser: "Browser",
      agents: "Agents",
      skills: "Skills",
      hooks: "Hooks"
    },
    newMessage: "new message",
    answerReady: "answer ready",
    turnAborted: "turn interrupted",
    step: (n) => `step ${n}`,
    subagent: "subagent",
    compacting: "compacting context",
    addedContext: (when) => `added context ${when}`,
    addedMemory: (when) => `added memory ${when}`,
    toMessage: "to the message",
    atStart: "at session start",
    records: (n, shown) => `${n} record${n === 1 ? "" : "s"}: ${shown}`,
    stopped: (tool) => `stopped ${tool}`,
    askedPermission: (tool) => `asked permission: ${tool}`,
    checkBefore: (tool) => `check before ${tool}`,
    running: "running",
    nothingYet: "Nothing yet.",
    noCounts: "No counts yet.",
    noPictureHere: "No picture in iTerm2 before 3.7.8: it keeps every frame in memory. See the README.",
    idle: "Nothing is running.",
    context: "context",
    andMore: (n) => ` and ${n} more`,
    webSearch: "web search",
    artifact: "artifact",
    workflow: "workflow",
    skill: "skill",
    loadingTools: "loading tools",
    questionForYou: "question for you",
    fileForYou: "file for you",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s} s`,
    minutes: (m, s) => `${m} min ${s} s`,
    hours: (h, m) => `${h} h ${m} min`
  };
  var ru = {
    title: "\u041A\u0430\u0440\u0442\u0430 \u0440\u0430\u0431\u043E\u0442\u044B",
    command: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u0443 \u0440\u0430\u0431\u043E\u0442\u044B \u0440\u044F\u0434\u043E\u043C \u0441 \u0447\u0430\u0442\u043E\u043C",
    opened: "\u041A\u0430\u0440\u0442\u0430 \u0440\u0430\u0431\u043E\u0442\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u0430.",
    cannotOpen: (reason) => `\u041A\u0430\u0440\u0442\u0443 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0433\u0434\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C: ${reason}`,
    zoomOut: "\u0423\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u044C",
    zoomIn: "\u0423\u0432\u0435\u043B\u0438\u0447\u0438\u0442\u044C",
    hideMap: "\u0421\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u0443",
    showMap: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043A\u0430\u0440\u0442\u0443",
    stations: {
      you: "\u0422\u044B",
      model: "\u041C\u043E\u0434\u0435\u043B\u044C",
      memory: "\u041F\u0430\u043C\u044F\u0442\u044C",
      files: "\u0424\u0430\u0439\u043B\u044B",
      shell: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
      web: "\u0421\u0435\u0442\u044C",
      browser: "\u0411\u0440\u0430\u0443\u0437\u0435\u0440",
      agents: "\u0410\u0433\u0435\u043D\u0442\u044B",
      skills: "\u0421\u043A\u0438\u043B\u043B\u044B",
      hooks: "\u0425\u0443\u043A\u0438"
    },
    newMessage: "\u043D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
    answerReady: "\u043E\u0442\u0432\u0435\u0442 \u0433\u043E\u0442\u043E\u0432",
    turnAborted: "\u0445\u043E\u0434 \u043F\u0440\u0435\u0440\u0432\u0430\u043D",
    step: (n) => `\u0448\u0430\u0433 ${n}`,
    subagent: "\u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442",
    compacting: "\u0441\u0436\u0430\u0442\u0438\u0435 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430",
    addedContext: (when) => `\u0434\u043E\u0431\u0430\u0432\u0438\u043B \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 ${when}`,
    addedMemory: (when) => `\u043F\u043E\u0434\u043C\u0435\u0448\u0430\u043B \u043F\u0430\u043C\u044F\u0442\u044C ${when}`,
    toMessage: "\u043A \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
    atStart: "\u043F\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0435",
    records: (n, shown) => `\u0437\u0430\u043F\u0438\u0441\u0435\u0439 ${n}: ${shown}`,
    stopped: (tool) => `\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B ${tool}`,
    askedPermission: (tool) => `\u0441\u043F\u0440\u043E\u0441\u0438\u043B \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435: ${tool}`,
    checkBefore: (tool) => `\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u0435\u0440\u0435\u0434 ${tool}`,
    running: "\u0438\u0434\u0451\u0442",
    nothingYet: "\u041F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0431\u044B\u043B\u043E.",
    noCounts: "\u0421\u0447\u0451\u0442\u0447\u0438\u043A\u0438 \u043F\u0443\u0441\u0442\u044B.",
    noPictureHere: "\u0412 iTerm2 \u0434\u043E 3.7.8 \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0438 \u043D\u0435\u0442: \u043E\u043D \u0434\u0435\u0440\u0436\u0438\u0442 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u043A\u0430\u0436\u0434\u044B\u0439 \u043A\u0430\u0434\u0440. \u0421\u043C. README.",
    idle: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435",
    context: "\u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442",
    andMore: (n) => ` \u0438 \u0435\u0449\u0451 ${n}`,
    webSearch: "\u043F\u043E\u0438\u0441\u043A \u0432 \u0441\u0435\u0442\u0438",
    artifact: "\u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442",
    workflow: "\u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441",
    skill: "\u0441\u043A\u0438\u043B\u043B",
    loadingTools: "\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
    questionForYou: "\u0432\u043E\u043F\u0440\u043E\u0441 \u0442\u0435\u0431\u0435",
    fileForYou: "\u0444\u0430\u0439\u043B \u0442\u0435\u0431\u0435",
    ms: (n) => `${n} \u043C\u0441`,
    seconds: (s) => `${s} \u0441`,
    minutes: (m, s) => `${m} \u043C\u0438\u043D ${s} \u0441`,
    hours: (h, m) => `${h} \u0447 ${m} \u043C\u0438\u043D`
  };
  var es = {
    title: "Mapa de trabajo",
    command: "Abrir el mapa de trabajo junto al chat",
    opened: "Mapa de trabajo abierto.",
    cannotOpen: (reason) => `Ahora no hay d\xF3nde mostrar el mapa: ${reason}`,
    zoomOut: "Alejar",
    zoomIn: "Acercar",
    hideMap: "Ocultar mapa",
    showMap: "Mostrar mapa",
    stations: {
      you: "T\xFA",
      model: "Modelo",
      memory: "Memoria",
      files: "Archivos",
      shell: "Terminal",
      web: "Red",
      browser: "Navegador",
      agents: "Agentes",
      skills: "Skills",
      hooks: "Hooks"
    },
    newMessage: "mensaje nuevo",
    answerReady: "respuesta lista",
    turnAborted: "turno interrumpido",
    step: (n) => `paso ${n}`,
    subagent: "subagente",
    compacting: "compactando el contexto",
    addedContext: (when) => `a\xF1adi\xF3 contexto ${when}`,
    addedMemory: (when) => `a\xF1adi\xF3 memoria ${when}`,
    toMessage: "al mensaje",
    atStart: "al iniciar la sesi\xF3n",
    records: (n, shown) => `${n} registro${n === 1 ? "" : "s"}: ${shown}`,
    stopped: (tool) => `detuvo ${tool}`,
    askedPermission: (tool) => `pidi\xF3 permiso: ${tool}`,
    checkBefore: (tool) => `comprobaci\xF3n antes de ${tool}`,
    running: "en curso",
    nothingYet: "Todav\xEDa nada.",
    noCounts: "A\xFAn no hay recuentos.",
    noPictureHere: "Sin imagen en iTerm2 anterior a 3.7.8: guarda en memoria cada fotograma. Ver el README.",
    idle: "No hay nada en ejecuci\xF3n.",
    context: "contexto",
    andMore: (n) => ` y ${n} m\xE1s`,
    webSearch: "b\xFAsqueda web",
    artifact: "artefacto",
    workflow: "flujo de trabajo",
    skill: "skill",
    loadingTools: "cargando herramientas",
    questionForYou: "pregunta para ti",
    fileForYou: "archivo para ti",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s} s`,
    minutes: (m, s) => `${m} min ${s} s`,
    hours: (h, m) => `${h} h ${m} min`
  };
  var fr = {
    title: "Carte du travail",
    command: "Ouvrir la carte du travail \xE0 c\xF4t\xE9 du chat",
    opened: "Carte du travail ouverte.",
    cannotOpen: (reason) => `Impossible d'afficher la carte pour le moment : ${reason}`,
    zoomOut: "D\xE9zoomer",
    zoomIn: "Zoomer",
    hideMap: "Masquer la carte",
    showMap: "Afficher la carte",
    stations: {
      you: "Vous",
      model: "Mod\xE8le",
      memory: "M\xE9moire",
      files: "Fichiers",
      shell: "Terminal",
      web: "R\xE9seau",
      browser: "Navigateur",
      agents: "Agents",
      skills: "Skills",
      hooks: "Hooks"
    },
    newMessage: "nouveau message",
    answerReady: "r\xE9ponse pr\xEAte",
    turnAborted: "tour interrompu",
    step: (n) => `\xE9tape ${n}`,
    subagent: "sous-agent",
    compacting: "compactage du contexte",
    addedContext: (when) => `contexte ajout\xE9 ${when}`,
    addedMemory: (when) => `m\xE9moire ajout\xE9e ${when}`,
    toMessage: "au message",
    atStart: "au d\xE9marrage de la session",
    records: (n, shown) => `${n} enregistrement${n > 1 ? "s" : ""} : ${shown}`,
    stopped: (tool) => `${tool} arr\xEAt\xE9`,
    askedPermission: (tool) => `autorisation demand\xE9e : ${tool}`,
    checkBefore: (tool) => `v\xE9rification avant ${tool}`,
    running: "en cours",
    nothingYet: "Rien pour le moment.",
    noCounts: "Aucun compteur pour le moment.",
    noPictureHere: "Pas d'image dans iTerm2 avant 3.7.8 : il garde chaque image en m\xE9moire. Voir le README.",
    idle: "Rien en cours.",
    context: "contexte",
    andMore: (n) => ` et ${n} de plus`,
    webSearch: "recherche web",
    artifact: "artefact",
    workflow: "workflow",
    skill: "skill",
    loadingTools: "chargement des outils",
    questionForYou: "question pour vous",
    fileForYou: "fichier pour vous",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s.replace(".", ",")} s`,
    minutes: (m, s) => `${m} min ${s} s`,
    hours: (h, m) => `${h} h ${m} min`
  };
  var de = {
    title: "Arbeitskarte",
    command: "Arbeitskarte neben dem Chat \xF6ffnen",
    opened: "Arbeitskarte ge\xF6ffnet.",
    cannotOpen: (reason) => `Die Karte kann gerade nirgends angezeigt werden: ${reason}`,
    zoomOut: "Verkleinern",
    zoomIn: "Vergr\xF6\xDFern",
    hideMap: "Karte ausblenden",
    showMap: "Karte zeigen",
    stations: {
      you: "Du",
      model: "Modell",
      memory: "Ged\xE4chtnis",
      files: "Dateien",
      shell: "Terminal",
      web: "Netzwerk",
      browser: "Browser",
      agents: "Agenten",
      skills: "Skills",
      hooks: "Hooks"
    },
    newMessage: "neue Nachricht",
    answerReady: "Antwort fertig",
    turnAborted: "Durchgang abgebrochen",
    step: (n) => `Schritt ${n}`,
    subagent: "Subagent",
    compacting: "Kontext wird komprimiert",
    addedContext: (when) => `Kontext ${when} hinzugef\xFCgt`,
    addedMemory: (when) => `Erinnerungen ${when} hinzugef\xFCgt`,
    toMessage: "zur Nachricht",
    atStart: "beim Sitzungsstart",
    records: (n, shown) => `${n} ${n === 1 ? "Eintrag" : "Eintr\xE4ge"}: ${shown}`,
    stopped: (tool) => `${tool} gestoppt`,
    askedPermission: (tool) => `um Erlaubnis gefragt: ${tool}`,
    checkBefore: (tool) => `Pr\xFCfung vor ${tool}`,
    running: "l\xE4uft",
    nothingYet: "Noch nichts.",
    noCounts: "Noch keine Z\xE4hlerst\xE4nde.",
    noPictureHere: "Kein Bild in iTerm2 vor 3.7.8: Es beh\xE4lt jedes Einzelbild im Speicher. Siehe README.",
    idle: "Nichts l\xE4uft.",
    context: "Kontext",
    andMore: (n) => ` und ${n} weitere`,
    webSearch: "Websuche",
    artifact: "Artefakt",
    workflow: "Workflow",
    skill: "Skill",
    loadingTools: "Werkzeuge werden geladen",
    questionForYou: "Frage an dich",
    fileForYou: "Datei f\xFCr dich",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s.replace(".", ",")} s`,
    minutes: (m, s) => `${m} Min. ${s} s`,
    hours: (h, m) => `${h} Std. ${m} Min.`
  };
  var it = {
    title: "Mappa del lavoro",
    command: "Apri la mappa del lavoro accanto alla chat",
    opened: "Mappa del lavoro aperta.",
    cannotOpen: (reason) => `Al momento non c'\xE8 dove mostrare la mappa: ${reason}`,
    zoomOut: "Riduci",
    zoomIn: "Ingrandisci",
    hideMap: "Nascondi mappa",
    showMap: "Mostra mappa",
    stations: {
      you: "Tu",
      model: "Modello",
      memory: "Memoria",
      files: "File",
      shell: "Terminale",
      web: "Rete",
      browser: "Browser",
      agents: "Agenti",
      skills: "Skill",
      hooks: "Hook"
    },
    newMessage: "nuovo messaggio",
    answerReady: "risposta pronta",
    turnAborted: "turno interrotto",
    step: (n) => `passo ${n}`,
    subagent: "subagente",
    compacting: "compattazione del contesto",
    addedContext: (when) => `contesto aggiunto ${when}`,
    addedMemory: (when) => `memoria aggiunta ${when}`,
    toMessage: "al messaggio",
    atStart: "all'avvio della sessione",
    records: (n, shown) => `${n} ${n === 1 ? "voce" : "voci"}: ${shown}`,
    stopped: (tool) => `${tool} fermato`,
    askedPermission: (tool) => `permesso chiesto: ${tool}`,
    checkBefore: (tool) => `controllo prima di ${tool}`,
    running: "in corso",
    nothingYet: "Ancora niente.",
    noCounts: "Ancora nessun conteggio.",
    noPictureHere: "Nessuna immagine in iTerm2 prima della 3.7.8: tiene in memoria ogni fotogramma. Vedi il README.",
    idle: "Niente in esecuzione.",
    context: "contesto",
    andMore: (n) => ` e altri ${n}`,
    webSearch: "ricerca web",
    artifact: "artefatto",
    workflow: "workflow",
    skill: "skill",
    loadingTools: "caricamento strumenti",
    questionForYou: "domanda per te",
    fileForYou: "file per te",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s.replace(".", ",")} s`,
    minutes: (m, s) => `${m} min ${s} s`,
    hours: (h, m) => `${h} h ${m} min`
  };
  var pt = {
    title: "Mapa de trabalho",
    command: "Abrir o mapa de trabalho ao lado do chat",
    opened: "Mapa de trabalho aberto.",
    cannotOpen: (reason) => `De momento n\xE3o h\xE1 onde mostrar o mapa: ${reason}`,
    zoomOut: "Reduzir",
    zoomIn: "Ampliar",
    hideMap: "Ocultar mapa",
    showMap: "Mostrar mapa",
    stations: {
      you: "Tu",
      model: "Modelo",
      memory: "Mem\xF3ria",
      files: "Ficheiros",
      shell: "Terminal",
      web: "Rede",
      browser: "Navegador",
      agents: "Agentes",
      skills: "Skills",
      hooks: "Hooks"
    },
    newMessage: "nova mensagem",
    answerReady: "resposta pronta",
    turnAborted: "turno interrompido",
    step: (n) => `passo ${n}`,
    subagent: "subagente",
    compacting: "a compactar o contexto",
    addedContext: (when) => `adicionou contexto ${when}`,
    addedMemory: (when) => `adicionou mem\xF3ria ${when}`,
    toMessage: "\xE0 mensagem",
    atStart: "no in\xEDcio da sess\xE3o",
    records: (n, shown) => `${n} registo${n === 1 ? "" : "s"}: ${shown}`,
    stopped: (tool) => `travou ${tool}`,
    askedPermission: (tool) => `pediu permiss\xE3o: ${tool}`,
    checkBefore: (tool) => `verifica\xE7\xE3o antes de ${tool}`,
    running: "em curso",
    nothingYet: "Ainda nada.",
    noCounts: "Ainda sem contagens.",
    noPictureHere: "Sem imagem no iTerm2 antes da 3.7.8: ele guarda cada quadro na mem\xF3ria. Veja o README.",
    idle: "Nada em execu\xE7\xE3o.",
    context: "contexto",
    andMore: (n) => ` e mais ${n}`,
    webSearch: "pesquisa na web",
    artifact: "artefacto",
    workflow: "workflow",
    skill: "skill",
    loadingTools: "a carregar ferramentas",
    questionForYou: "pergunta para ti",
    fileForYou: "ficheiro para ti",
    ms: (n) => `${n} ms`,
    seconds: (s) => `${s.replace(".", ",")} s`,
    minutes: (m, s) => `${m} min ${s} s`,
    hours: (h, m) => `${h} h ${m} min`
  };
  var TABLES = /* @__PURE__ */ new Map([["en", en], ["ru", ru], ["es", es], ["fr", fr], ["de", de], ["it", it], ["pt", pt]]);
  var stringsFor = (language) => TABLES.get(language) ?? en;

  // vendor/lot-map/hooks/setup.ts
  var STATIONS = [
    { id: "you", icon: `${ring(0, -3.6, 3.4)}M-6.5 8c0-4 3-6.2 6.5-6.2s6.5 2.2 6.5 6.2` },
    { id: "model", icon: "M-5 -5h10v10h-10zM-2 -8.5v3.5M2 -8.5v3.5M-2 5v3.5M2 5v3.5M-8.5 -2h3.5M-8.5 2h3.5M5 -2h3.5M5 2h3.5" },
    { id: "memory", icon: `M-5 4.5L0 -5L6 3.5M-5 4.5L6 3.5${ring(-5, 4.5, 2.1)}${ring(0, -5, 2.1)}${ring(6, 3.5, 2.1)}` },
    { id: "files", icon: "M-5.5 -8h7.5l3.5 3.5v12.5h-11zM2 -8v3.5h3.5" },
    { id: "shell", icon: "M-7.5 -5l5 5l-5 5M0 6h7.5" },
    { id: "web", icon: `${ring(0, 0, 7.8)}M-7.8 0h15.6M0 -7.8c-4.2 4.2 -4.2 11.4 0 15.6M0 -7.8c4.2 4.2 4.2 11.4 0 15.6` },
    { id: "browser", icon: "M-8.5 -6.5h17v13h-17zM-8.5 -2.8h17M-6.3 -4.7h.1M-3.8 -4.7h.1" },
    { id: "agents", icon: `M0 -4v3.5M0 -.5L-6 4M0 -.5L6 4${ring(0, -6, 2.1)}${ring(-6.5, 5.5, 2.1)}${ring(6.5, 5.5, 2.1)}` },
    { id: "skills", icon: "M1.5 -8.5L-5.5 1h4.5l-1.5 7.5l7.5 -9.8h-4.5z" },
    { id: "hooks", icon: `M2.5 -5.5v8a4.2 4.2 0 1 1 -8.4 0v-1.5${ring(2.5, -7.3, 1.8)}` }
  ];
  function ring(x, y, r) {
    return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  var CELL_SHAPE = 2.4;
  function cellShapeFrom(value) {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    return Number.isFinite(n) && n >= 1.2 && n <= 4 ? n : CELL_SHAPE;
  }
  var SERVER_STATIONS = ["files", "shell", "web", "browser", "agents", "skills", "you"];
  var flag = (v, byDefault) => v === true || v === "true" ? true : v === false || v === "false" ? false : byDefault;
  var list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter((x) => x !== "");
  function setupFrom(options = {}) {
    const memoryLabels = /* @__PURE__ */ new Map();
    for (const pair of list(options.memoryLabels)) {
      const at = pair.indexOf("=");
      if (at > 0 && at < pair.length - 1) memoryLabels.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    const stationsFrom = (value) => {
      const chosen = /* @__PURE__ */ new Map();
      for (const pair of list(value)) {
        const at = pair.indexOf("=");
        const station = SERVER_STATIONS.find((id) => id === pair.slice(at + 1).trim());
        if (at > 0 && station !== void 0) chosen.set(pair.slice(0, at).trim(), station);
      }
      return chosen;
    };
    const serverStations = stationsFrom(options.serverStations);
    const commandStations = stationsFrom(options.commandStations);
    const core = typeof options.coreName === "string" ? [...clean(options.coreName)].slice(0, 10).join("").trim() : "";
    return {
      t: stringsFor(options.language),
      core: core === "" ? "CLAUDE" : core,
      memoryServers: new Set(list(options.memoryServers)),
      memoryCommands: list(options.memoryCommands),
      memorySubcommands: new Set(list(options.memorySubcommands)),
      memoryPaths: list(options.memoryPaths),
      memoryLabels,
      serverStations,
      commandStations,
      hookRecords: flag(options.hookRecords, false),
      hookReasons: flag(options.hookReasons, false),
      guardedHooks: flag(options.guardedHooks, true),
      openAtStart: flag(options.openAtStart, true),
      subagentNames: flag(options.subagentNames, false),
      contextCost: flag(options.contextCost, false),
      contextWindow: options.contextWindow === "compaction" ? "compaction" : "model",
      theme: options.theme === "dark" || options.theme === "light" ? options.theme : "auto",
      background: options.background === "transparent" ? "transparent" : "solid",
      paneBackground: paneBackgroundFrom(options.paneBackground),
      colors: colorsFrom(options.colors),
      layout: options.layout === "you-bottom" ? "you-bottom" : "you-top",
      motion: options.motion === "reduced" ? "reduced" : "full",
      textSize: options.textSize === "caption" || options.textSize === "body" ? options.textSize : "footnote",
      logRows: options.logRows === "fill" ? "fill" : 16,
      terminalView: options.terminalView === "picture" || options.terminalView === "braille" ? options.terminalView : "text",
      cellShape: cellShapeFrom(options.cellShape)
    };
  }
  function paneBackgroundFrom(v) {
    const value = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (value === "transparent") return "transparent";
    const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];
    if (digits === void 0) return "theme";
    return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
  }
  function colorsFrom(v) {
    const out = {};
    for (const pair of list(v)) {
      const at = pair.indexOf("=");
      const key = COLOR_NAMES[pair.slice(0, at).trim()];
      const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.exec(pair.slice(at + 1).trim())?.[0].toLowerCase();
      if (at < 1 || key === void 0 || hex === void 0) continue;
      out[key] = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    }
    return out;
  }
  return __toCommonJS(setup_exports);
})();

// ── stations ────────────────────────────────────────────────────────────────

const STATIONS = [
  { id: 'you', label: 'YOU' },
  { id: 'files', label: 'FILES' },
  { id: 'shell', label: 'SHELL' },
  { id: 'web', label: 'WEB' },
  { id: 'browser', label: 'BROWSER' },
  { id: 'agents', label: 'AGENTS' },
  { id: 'memory', label: 'MEMORY' },
  { id: 'tools', label: 'TOOLS' }
]

const FILE_TOOLS = new Set(['read_file', 'write_file', 'patch', 'search_files'])
const SHELL_TOOLS = new Set(['terminal', 'execute_code', 'process_manage'])
const WEB_TOOLS = new Set(['web_search', 'web_extract'])
const AGENT_TOOLS = new Set(['delegate_task', 'cronjob', 'cronjob_manage', 'cronjob_list'])
const YOU_TOOLS = new Set(['clarify', 'todo_list', 'todo'])

/** Map a Hermes tool name to a station id. Unknown/MCP tools land on Skills. */
function classify(name) {
  const n = String(name || '')
  if (FILE_TOOLS.has(n)) return 'files'
  if (SHELL_TOOLS.has(n)) return 'shell'
  if (WEB_TOOLS.has(n)) return 'web'
  if (['browser_exec', 'browser_cdp', 'browser_dialog', 'browser_vault'].includes(n)) return 'browser'
  if (AGENT_TOOLS.has(n)) return 'agents'
  if (n === 'memory' || n.startsWith('lcm_') || n.startsWith('hindsight_')) return 'memory'
  if (YOU_TOOLS.has(n)) return 'you'
  return 'skills'
}

/** First interesting argument of a call, for the feed row. */
function hintOf(args) {
  if (!args || typeof args !== 'object') return ''
  const keys = ['command', 'path', 'file_path', 'url', 'query', 'pattern', 'prompt', 'goal', 'name', 'action']
  for (const k of keys) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) {
      let s = v.trim().replace(/\s+/g, ' ')
      if (s.length > 26) s = s.slice(0, 25) + '…'
      return ' ' + s
    }
    if (typeof v === 'number' || typeof v === 'boolean') return ' ' + String(v)
  }
  return ''
}

const nowMs = () => Date.now()
const newId = () => nowMs().toString(36) + Math.random().toString(36).slice(2, 6)
const KEEP = 60

// ── board ───────────────────────────────────────────────────────────────────

function freshBoard() {
  return {
    entries: [],            // {id, toolId?, station, label, status: run|ok|err, t0, t1, ms, fromAgent?}
    counts: {},             // station -> total calls
    faults: {},             // station -> errors since last answer
    ctxPct: null,           // 0..1 context window fill

    answeredAt: 0,          // last message.complete ms
    nowLine: '',            // status.update text
    todos: 0,               // todo.updated count
    tokens: null,           // cumulative session tokens (session.usage)
    calls: 0,               // cumulative api calls (session.usage)
    model: null,
    switchedAt: 0
  }
}

const board = atom(freshBoard())
const clock = atom(nowMs())

const looksLikeError = (p) => {
  const r = p && p.result
  if (r && typeof r === 'object' && r.success === false) return true
  const t = String(p && (p.result_text || p.summary) || '')
  return /"success":\s*false|"error"\s*:|Traceback|command not found|exit_code":\s*[^0]/.test(t.slice(0, 400))
}

const touch = (fn) => board.set(fn(board.get()))

function beginEntry(toolId, station, label, fromAgent, route, kind = 'tool') {
  touch((b) => ({
    ...b,
    entries: [...b.entries, {
      id: newId(), toolId, station, label, route, kind,
      status: 'run', t0: nowMs(), t1: 0, ms: 0,
      ...(fromAgent ? { fromAgent: true } : {})
    }].filter((e, i, all) => e.status === 'run' || i >= all.length - KEEP),
    counts: kind === 'model' ? b.counts : { ...b.counts, [station]: (b.counts[station] || 0) + 1 }
  }))
}

function endEntry(toolId, err, ms, route, kind = 'tool') {
  touch((b) => {
    const entries = b.entries.slice()
    const i = toolId && route ? entries.findIndex((e) => e.toolId === toolId && e.route === route && e.kind === kind && e.status === 'run') : -1
    let faults = b.faults
    if (i >= 0) {
      const e = entries[i]
      const t1 = nowMs()
      entries[i] = { ...e, status: err ? 'err' : 'ok', t1, ms: ms != null ? ms : t1 - e.t0 }
      if (err) faults = { ...b.faults, [entries[i].station]: (b.faults[entries[i].station] || 0) + 1 }
    }
    return { ...b, entries, faults }
  })
}

// ── components ──────────────────────────────────────────────────────────────
// children in config.children; keys as the third jsx()/jsxs() argument.

// The SVG is generated exclusively by the vendored lot-map renderer. The
// adapter supplies fixed station names and numeric state, never event text.
// Reconcile in place: replacing innerHTML destroys the SVG time container and
// interrupts every SMIL animation on each 250 ms tick or gateway event.
function updateMap(host, markup) {
  if (!host) return
  const template = host.ownerDocument.createElement('template')
  template.innerHTML = markup
  const next = template.content.firstElementChild
  if (!host.firstElementChild) { host.appendChild(next); return }
  const root = host.firstElementChild
  const offset = typeof root.getCurrentTime === 'function' ? root.getCurrentTime() : 0
  const prepare = node => {
    if (node.nodeType !== 1) return
    for (const animation of [node, ...node.querySelectorAll('[begin]')]) {
      const begin = animation.getAttribute('begin')
      if (begin && /^-?\d+(?:\.\d+)?s$/.test(begin)) animation.setAttribute('begin', `${parseFloat(begin) + offset}s`)
    }
  }
  const sync = (old, fresh) => {
    if (old.nodeType === 3) { if (old.nodeValue !== fresh.nodeValue) old.nodeValue = fresh.nodeValue; return }
    const animation = /^(animate|animateMotion|animateTransform)$/.test(old.localName)
    for (const attr of [...old.attributes]) if (!fresh.hasAttribute(attr.name)) old.removeAttribute(attr.name)
    for (const attr of [...fresh.attributes]) {
      // Generated begin values are relative to now; existing values are on
      // the SVG clock. Keep their phase unless a genuinely new event changed it.
      if (animation && attr.name === 'begin' && /^-?\d+(?:\.\d+)?s$/.test(attr.value)) {
        const desired = parseFloat(attr.value) + offset
        const previous = parseFloat(old.getAttribute('begin'))
        const repeating = fresh.getAttribute('repeatCount') === 'indefinite'
        const period = repeating ? parseFloat(fresh.getAttribute('dur')) : 0
        const difference = desired - previous
        const phaseDifference = period ? difference - Math.round(difference / period) * period : difference
        if (!Number.isFinite(previous) || Math.abs(phaseDifference) > 0.1) old.setAttribute('begin', `${desired}s`)
        continue
      }
      if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value)
    }
    const children = [...fresh.childNodes]
    const keys = new Set(children.map(n => n.nodeType === 1 && n.getAttribute('data-lm-key')).filter(Boolean))
    for (const child of [...old.childNodes]) {
      const key = child.nodeType === 1 && child.getAttribute('data-lm-key')
      if (key && !keys.has(key)) child.remove()
    }
    let cursor = old.firstChild
    for (const wanted of children) {
      const key = wanted.nodeType === 1 && wanted.getAttribute('data-lm-key')
      let match = key ? [...old.childNodes].find(n => n.nodeType === 1 && n.getAttribute('data-lm-key') === key) : cursor
      if (match && (match.nodeType !== wanted.nodeType || match.nodeName !== wanted.nodeName || (!key && match.nodeType === 1 && match.hasAttribute('data-lm-key')))) match = null
      if (!match) { match = wanted.cloneNode(true); prepare(match); old.insertBefore(match, cursor) }
      else { if (match !== cursor) old.insertBefore(match, cursor); sync(match, wanted) }
      cursor = match.nextSibling
    }
    while (cursor) { const next = cursor.nextSibling; cursor.remove(); cursor = next }
  }
  sync(root, next)
}

function MapSvg({ b, now, motion }) {
  const entries = b.entries.map(e => ({
    id: e.id, station: e.station, label: '', from: e.fromAgent ? 'agents' : 'core',
    startedAt: e.t0, endedAt: e.t1 || undefined, status: e.status, satellite: e.kind === 'tool'
  }))

  if (b.answeredAt) entries.push({ id: 'answer-' + b.answeredAt, station: 'you', label: '', from: 'core', startedAt: b.answeredAt, status: 'ok', mark: 'done' })
  const originalBoard = { entries, counts: b.counts, faults: b.faults,
    ...(b.model ? { model: b.model, switchedAt: b.switchedAt || undefined } : {}),
    ...(b.ctxPct == null ? {} : { context: b.ctxPct * 100 }) }
  const setup = LotMapSetup.setupFrom({ coreName: 'HERMES', motion: motion ? 'full' : 'reduced' })
  const svg = LotMapOriginal.drawMap(originalBoard, now, setup)
  return jsx('div', { className: 'lm-original', role: 'img', 'aria-label': 'Hermes activity map',
    style: { width: '100%', flex: 'none', lineHeight: 0 },
    ref: host => updateMap(host, svg) })
}

const fmtMs = (ms) => ms == null ? '-' : ms < 1000 ? Math.max(0, Math.round(ms)) + ' ms' : (ms / 1000).toFixed(1) + ' s'
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M tok' : n >= 1e3 ? Math.round(n / 1e3) + 'k tok' : n + ' tok'
const C = { teal: '#caa778', red: '#f87171' }
const TERT = 'var(--ui-text-tertiary, #94a3b8)'
const SEC = 'var(--ui-text-secondary, #cbd5e1)'

const GLYPH = { run: '●', ok: '·', err: '✕' }
const GLYPH_COLOR = { run: C.teal, ok: TERT, err: C.red }

/** Fold consecutive finished rows at one station into one row (+N). */
function foldRows(entries) {
  const out = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && e.status !== 'run' && last.status === e.status && last.label === e.label && last.station === e.station) {
      last.fold = (last.fold || 1) + 1
      last.ms = Math.max(last.ms || 0, e.ms || 0)
    } else {
      out.push({ ...e })
    }
  }
  return out
}

function Feed({ b }) {
  const rows = foldRows(b.entries).slice(-13)
  return jsx('div', {
    style: {
      flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 4,
      fontSize: 11, lineHeight: '17px',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
    },
    children: rows.length === 0
      ? jsx('div', { style: { color: TERT, padding: '6px 2px' }, children: 'Waiting for the first call…' })
      : rows.map((e) => jsxs('div', {
          style: { display: 'flex', gap: 6, alignItems: 'baseline', whiteSpace: 'nowrap' },
          children: [
            jsx('span', { style: { color: GLYPH_COLOR[e.status], flex: 'none' }, children: GLYPH[e.status] }, 'g0'),
            e.fromAgent ? jsx('span', { style: { color: TERT, flex: 'none' }, children: '↳' }, 'g1') : null,
            jsx('span', {
              style: {
                overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto',
                color: e.status === 'err' ? C.red : SEC
              },
              children: e.label
            }, 'g2'),
            e.fold > 1 ? jsx('span', { style: { color: TERT, flex: 'none' }, children: '+' + (e.fold - 1) }, 'g3') : null,
            jsx('span', {
              style: { flex: 'none', minWidth: 44, textAlign: 'right', color: TERT },
              children: e.status === 'run' ? '' : fmtMs(e.ms)
            }, 'g4')
          ]
        }, e.id))
  })
}

const CSS = `
.lm-original svg { width: 100%; height: auto; }
.lm-breathe { animation: lm-breathe 1.6s ease-in-out infinite; }
@keyframes lm-breathe { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }
.lm-answer { animation: lm-answer 1.4s ease-out forwards; }
@keyframes lm-answer { from { r: 32; opacity: 0.9 } to { r: 64; opacity: 0 } }
.lm-blink { animation: lm-blink 0.28s linear; }
@keyframes lm-blink { 0% { opacity: 1 } 40% { opacity: 0.1 } 100% { opacity: 1 } }
`

function LotMapPane({ motionPref }) {
  const b = useValue(board)
  const now = useValue(clock)
  const motion = motionPref.get().motion !== 'reduced'
  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 10px 6px', gap: 2 },
    children: [
      jsx('style', { children: CSS }, 'css'),
      MapSvg({ b, now, motion }),
      b.nowLine
        ? jsx('div', {
            style: {
              fontSize: 10.5, color: TERT,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '4px 2px 0'
            },
            children: b.nowLine
          }, 'now')
        : null,
      b.todos > 0 || b.calls > 0
        ? jsx('div', {
            style: { fontSize: 10, color: TERT, padding: '2px 2px 0', whiteSpace: 'nowrap' },
            children: [
              b.todos > 0 ? 'tasks: ' + b.todos : '',
              b.todos > 0 && b.calls > 0 ? ' · ' : '',
              b.calls > 0
                ? b.tokens ? b.calls + ' calls · ' + fmtTok(b.tokens) : b.calls + ' calls'
                : ''
            ].filter(Boolean).join('')
          }, 'todos')
        : null,
      Feed({ b })
    ]
  })
}

/** Status-bar chip: live activity even when the pane is collapsed. */
function Chip() {
  const b = useValue(board)
  const run = b.entries.reduce((n, e) => n + (e.status === 'run' ? 1 : 0), 0)
  const label = run > 0
    ? run + ' running'
    : b.calls > 0 ? b.calls + (b.tokens ? ' · ' + fmtTok(b.tokens) : '') : 'idle'
  return jsxs('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, color: run > 0 ? C.teal : TERT, padding: '0 6px', userSelect: 'none'
    },
    title: 'Hermes Lot Map - live activity',
    children: [
      jsx('span', {
        style: {
          width: 6, height: 6, borderRadius: '50%', flex: 'none',
          background: run > 0 ? C.teal : TERT,
          opacity: run > 0 ? 1 : 0.4
        }
      }, 'd'),
      jsx('span', { style: { whiteSpace: 'nowrap' }, children: label }, 't')
    ]
  })
}

// ── plugin ──────────────────────────────────────────────────────────────────

export const __test = { board, classify, foldRows, hintOf, MapSvg, updateMap, drawMap: LotMapOriginal.drawMap, setupFrom: LotMapSetup.setupFrom }

export default {
  id: 'hermes-lot-map',
  name: 'Hermes Lot Map',
  description: 'A live map pane for Hermes Desktop using the original lot-map renderer. Tool activity and context usage are shown when events are available.',

  register(ctx) {
    const motionPref = atom(ctx.storage.get('motion', { motion: 'full' }))
    const saveMotion = (v) => { motionPref.set({ ...motionPref.get(), motion: v }); ctx.storage.set('motion', motionPref.get()) }

    // tick for pulse/glow lifetimes
    ctx.setInterval(() => clock.set(nowMs()), 250)

    // Never correlate across a session/connection/profile. Missing session IDs
    // cannot be safely correlated. This does not filter the global event tap.
    const routeOf = ev => ev?.session_id ? JSON.stringify([ev.connectionId ?? null, ev.profile ?? null, ev.session_id]) : null
    const setModel = model => {
      if (typeof model !== 'string' || !model || model.length > 200) return
      touch(b => ({ ...b, model, switchedAt: b.model && b.model !== model ? nowMs() : b.switchedAt }))
    }
    // Only observed stream activity starts a model interval. It represents an
    // observation, not an API request; message.start is a whole turn boundary.
    const observeModel = ev => {
      const route = routeOf(ev)
      if (!route || board.get().entries.some(e => e.kind === 'model' && e.route === route && e.status === 'run')) return
      beginEntry('model', 'model', 'model activity', false, route, 'model')
    }
    const finishModel = ev => endEntry('model', false, null, routeOf(ev), 'model')
    ctx.onEvent('tool.start', (ev) => {
      const p = ev && ev.payload
      if (!p || typeof p.name !== 'string' || !p.name || !p.tool_id || !routeOf(ev)) return
      finishModel(ev)
      beginEntry(p.tool_id, classify(p.name), p.name, false, routeOf(ev))
    })

    ctx.onEvent('tool.complete', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.name) return
      endEntry(p.tool_id, looksLikeError(p), p.duration_s != null ? p.duration_s * 1000 : null, routeOf(ev))
    })

    for (const type of ['message.delta', 'reasoning.delta', 'thinking.delta', 'tool.generating']) ctx.onEvent(type, observeModel)
    ctx.onEvent('message.complete', ev => {
      finishModel(ev)
      touch(b => ({ ...b, answeredAt: nowMs(), faults: {} }))
    })

    ctx.onEvent('session.info', ev => setModel(ev?.payload?.model))
    ctx.onEvent('session.usage', (ev) => {
      const p = ev && ev.payload
      if (!p) return
      setModel(p.model)
      touch((b) => ({
        ...b,
        ctxPct: Number.isFinite(p.context_tokens) && Number.isFinite(p.context_length) && p.context_length > 0 ? Math.max(0, Math.min(1, p.context_tokens / p.context_length)) : b.ctxPct,
        tokens: Number.isFinite(p.total_tokens) ? p.total_tokens : b.tokens,
        calls: Number.isFinite(p.api_calls) ? p.api_calls : b.calls
      }))
    })

    // Optional identity is required: older unidentifiable children are omitted.
    ctx.onEvent('subagent.start', ev => {
      const id = ev?.payload?.subagent_id, route = routeOf(ev)
      if (typeof id !== 'string' || !id || !route) return
      if (board.get().entries.some(e => e.kind === 'subagent' && e.toolId === id && e.route === route && e.status === 'run')) return
      beginEntry(id, 'agents', 'subagent', false, route, 'subagent')
    })
    ctx.onEvent('subagent.complete', ev => {
      const p = ev?.payload
      if (!p || typeof p.subagent_id !== 'string' || !['completed', 'failed', 'error', 'timeout', 'interrupted'].includes(p.status)) return
      endEntry(p.subagent_id, ['failed', 'error', 'timeout', 'interrupted'].includes(p.status), Number.isFinite(p.duration_seconds) ? p.duration_seconds * 1000 : null, routeOf(ev), 'subagent')
    })

    ctx.onEvent('status.update', (ev) => {
      const p = ev && ev.payload
      // Status text can contain private conversation content; do not retain it.
    })
    ctx.onEvent('todo.updated', (ev) => {
      const p = ev && ev.payload
      if (p && Array.isArray(p.todos)) touch((b) => ({ ...b, todos: p.todos.length }))
    })

    // status-bar chip: live even when the pane is collapsed (area may not
    // exist on older hosts; register is harmless if unsupported)
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 50,
      render: () => jsx(Chip, {})
    })

    // the pane: its own tiling pane on the workspace's right edge
    ctx.register({
      id: 'pane',
      area: 'panes',
      title: 'Hermes Lot Map',
      data: {
        placement: 'main',
        dock: { pane: 'workspace', pos: 'right' },
        width: '320px',
        tabTitleText: () => 'Hermes Lot Map'
      },
      render: () => jsx(LotMapPane, { motionPref })
    })

    // Settings ▸ Plugins ▸ Hermes Lot Map (feature-detected for older hosts)
    ctx.registerSettingsPage?.({
      id: 'motion',
      title: 'Hermes Lot Map',
      render: function MotionSettings() {
        const prefs = useValue(motionPref)
        const reduced = prefs.motion === 'reduced'
        return jsxs('div', {
          style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
          children: [
            jsx('button', {
              onClick: () => saveMotion(reduced ? 'full' : 'reduced'),
              style: {
                alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--ui-stroke-tertiary, #334155)',
                background: 'var(--ui-surface-2, transparent)',
                color: 'var(--ui-text-primary, inherit)', fontSize: 12
              },
              children: reduced ? 'Motion: reduced (click for full)' : 'Motion: full (click for reduced)'
            }, 'btn'),
            jsx('div', {
              style: { fontSize: 11, color: TERT },
              children: 'Reduced motion keeps the map static: stations light up and fade, nothing flies.'
            }, 'hint')
          ]
        })
      }
    })
  }
}
