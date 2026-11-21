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
  var TRAIL_HOLD_MS = 4e4;
  var TRAIL_FADE_MS = 2e4;
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
  function pulse(a, b, color, age, radius, isHollow = false) {
    const path = `M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}`;
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
      if (last !== void 0 && last.station === e.station) last.at = e.startedAt;
      else stops.push({ station: e.station, at: e.startedAt });
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
      const fade = `<animate attributeName="opacity" values="${opacity};0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/>`;
      const drawing = isHead && !isStill ? ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(to.at - now)}" dur=".5s" fill="freeze"/>` : ">";
      out += `<path d="${path}" fill="none" stroke="${c.trail}" stroke-width="${isHead ? 1.5 : 1.1}" stroke-linecap="round" opacity="${opacity}"${drawing}${fade}</path>`;
      if (isHead) {
        out += `<circle cx="${n1(end.x)}" cy="${n1(end.y)}" r="2.4" fill="${c.trail}" opacity="${isStill ? ".85" : "0"}">` + (isStill ? "" : `<animate attributeName="opacity" values="0;.85" begin="${clock(to.at - now + 400)}" dur=".15s" fill="freeze"/>`) + `<animate attributeName="opacity" values=".85;0" begin="${clock(TRAIL_HOLD_MS - age)}" dur="${clock(TRAIL_FADE_MS)}" fill="freeze"/></circle>`;
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
      const hand = (r, width, lapMs, isOnce) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${hot}" stroke-width="${width}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${x} ${y})"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(-(isOnce ? Math.min(elapsed, lapMs) : elapsed % lapMs))}" dur="${clock(lapMs)}" ${isOnce ? 'fill="freeze"' : 'repeatCount="indefinite"'}/></circle>`;
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
    const recent = board.entries.slice(-40);
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
    STATIONS.forEach((s, i) => {
      const p = place(i, shift);
      const a = edge(core, p, HUB);
      const b = edge(p, core, NODE);
      const worn = Math.min(1, Math.log2(1 + (board.counts[s.id] ?? 0)) / 7);
      const line = `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke-width="${n1(1 + 2.6 * worn)}" stroke-linecap="round"`;
      body += `${line} stroke="${c.spoke}"/>`;
      if (worn > 0) body += `${line} stroke="${s.id === "memory" ? c.mem : c.accent}" opacity="${n1(worn * 0.55)}"/>`;
    });
    const scene = { entries: recent, board, now, c, names: setup.t.stations, isStill, shift, spent: setup.contextCost ? board.spent : void 0 };
    const drawn = STATIONS.map((s, i) => station(s, i, scene));
    body += drawn.map((d) => d.under).join("");
    body += trail(recent, now, c, isStill, shift);
    const ends = (e) => {
      const p = place(indexOf(e.station), shift);
      const start = e.from === "agents" ? agentsAt : core;
      return [edge(start, p, e.from === "agents" ? NODE : HUB), edge(p, start, NODE)];
    };
    const lane = (list, e) => {
      const peers = list.filter((x) => x.station === e.station && x.from === e.from);
      return (peers.indexOf(e) - (peers.length - 1) / 2) * 5;
    };
    for (const e of beams) {
      const [a, b] = ends(e);
      body += beam(a, b, isBad(e) ? c.red : tone(e)[0], now - e.startedAt, e.from === "inbound");
    }
    for (const e of flights) {
      const [a, b] = aside(...ends(e), lane(flights, e));
      const age = now - e.startedAt;
      const color = e.status === "block" ? c.red : tone(e)[1];
      if (e.from === "inbound") {
        body += pulse(b, a, color, age, 3.8, true) + ripple(core, HUB - 2, color, age);
      } else {
        body += pulse(a, b, color, age, 3.8) + ripple(place(indexOf(e.station), shift), NODE, color, age);
      }
    }
    for (const e of returns) {
      const [a, b] = aside(...ends(e), lane(returns, e));
      body += pulse(b, a, e.status === "ok" ? c.ash : c.red, now - e.endedAt, 2.6);
    }
    body += drawn.map((d) => d.over).join("");
    const crew = (board.agents ?? []).slice(0, 6);
    crew.forEach((_, k) => {
      const lap = 7e3;
      const spin = `${n1(agentsAt.x)} ${n1(agentsAt.y)}`;
      if (isStill) {
        body += `<g transform="rotate(${n1(360 * k / crew.length)} ${spin})"><circle cx="${n1(agentsAt.x)}" cy="${n1(agentsAt.y - NODE - 6)}" r="3" fill="${c.hot}"/></g>`;
        return;
      }
      body += `<g><animateTransform attributeName="transform" type="rotate" from="0 ${spin}" to="360 ${spin}" begin="${clock(-((now + k * lap / crew.length) % lap))}" dur="${clock(lap)}" repeatCount="indefinite"/><circle cx="${n1(agentsAt.x)}" cy="${n1(agentsAt.y - NODE - 6)}" r="3" fill="${c.hot}"/></g>`;
    });
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
const TOOL_TOOLS = new Set([
  'skill_view', 'skills_list', 'skill_manage', 'tool_search', 'tool_describe',
  'tool_call', 'manage_connections', 'text_to_speech', 'vision_analyze',
  'image_gen', 'video_analyze', 'video_gen'
])
const YOU_TOOLS = new Set(['clarify', 'todo_list', 'todo'])

/** Map a Hermes tool name to a station id. Unknown/MCP tools land on TOOLS. */
function classify(name) {
  const n = String(name || '')
  if (FILE_TOOLS.has(n)) return 'files'
  if (SHELL_TOOLS.has(n)) return 'shell'
  if (WEB_TOOLS.has(n)) return 'web'
  if (n === 'browser_exec') return 'browser'
  if (AGENT_TOOLS.has(n)) return 'agents'
  if (n === 'memory' || n.startsWith('lcm_')) return 'memory'
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
    modelLiveAt: 0,         // last message.delta/generating ms
    answeredAt: 0,          // last message.complete ms
    nowLine: '',            // status.update text
    todos: 0,               // todo.updated count
    tokens: null,           // cumulative session tokens (session.usage)
    calls: 0                // cumulative api calls (session.usage)
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

function beginEntry(toolId, station, label, fromAgent) {
  touch((b) => ({
    ...b,
    entries: [...b.entries, {
      id: newId(), toolId, station, label,
      status: 'run', t0: nowMs(), t1: 0, ms: 0,
      ...(fromAgent ? { fromAgent: true } : {})
    }].slice(-KEEP),
    counts: { ...b.counts, [station]: (b.counts[station] || 0) + 1 }
  }))
}

function endEntry(toolId, err, ms) {
  touch((b) => {
    const entries = b.entries.slice()
    let i = toolId ? entries.findIndex((e) => e.toolId === toolId && e.status === 'run') : -1
    if (i < 0 && !toolId) {
      i = -1
      for (let j = entries.length - 1; j >= 0; j--) if (entries[j].status === 'run') { i = j; break }
    }
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
function MapSvg({ b, now, motion }) {
  const entries = b.entries.map(e => ({
    id: e.id, station: e.station, label: '', from: e.fromAgent ? 'agents' : 'core',
    startedAt: e.t0, endedAt: e.t1 || undefined, status: e.status
  }))
  if (b.answeredAt) entries.push({ id: 'answer', station: 'you', label: '', from: 'core', startedAt: b.answeredAt, status: 'ok', mark: 'done' })
  const originalBoard = { entries, counts: b.counts, faults: b.faults,
    ...(b.ctxPct == null ? {} : { context: b.ctxPct * 100 }) }
  const setup = LotMapSetup.setupFrom({ coreName: 'HERMES', motion: motion ? 'full' : 'reduced' })
  const svg = LotMapOriginal.drawMap(originalBoard, now, setup)
  return jsx('div', { className: 'lm-original', role: 'img', 'aria-label': 'Hermes activity map',
    style: { width: '100%', flex: 'none', lineHeight: 0 },
    dangerouslySetInnerHTML: { __html: svg } })
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

export const __test = { board, classify, foldRows, hintOf, MapSvg }

export default {
  id: 'hermes-lot-map',
  name: 'Hermes Lot Map',
  description: 'A live map pane for Hermes Desktop using the original lot-map renderer. Tool activity and context usage are shown when events are available.',

  register(ctx) {
    const motionPref = atom(ctx.storage.get('motion', { motion: 'full' }))
    const saveMotion = (v) => { motionPref.set({ ...motionPref.get(), motion: v }); ctx.storage.set('motion', motionPref.get()) }

    // tick for pulse/glow lifetimes
    ctx.setInterval(() => clock.set(nowMs()), 250)

    ctx.onEvent('tool.start', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.name) return
      beginEntry(p.tool_id, classify(p.name), p.name)
    })

    ctx.onEvent('tool.complete', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.name) return
      endEntry(p.tool_id, looksLikeError(p), p.duration_s != null ? p.duration_s * 1000 : null)
    })

    ctx.onEvent('message.delta', () => touch((b) => ({ ...b, modelLiveAt: nowMs() })))
    ctx.onEvent('tool.generating', () => touch((b) => ({ ...b, modelLiveAt: nowMs() })))
    ctx.onEvent('message.complete', () => touch((b) => ({
      ...b, modelLiveAt: 0, answeredAt: nowMs(), faults: {}
    })))

    ctx.onEvent('session.usage', (ev) => {
      const p = ev && ev.payload
      if (!p || !p.context_length) return
      const u = p.usage || {}
      const tok = u.total != null ? u.total
        : (u.input || 0) + (u.output || 0) + (u.cache_read || 0) + (u.cache_write || 0)
      touch((b) => ({
        ...b,
        ctxPct: Math.max(0, Math.min(1, (p.context_tokens || 0) / p.context_length)),
        tokens: tok > 0 ? tok : b.tokens,
        calls: p.api_calls != null ? p.api_calls : b.calls
      }))
    })

    // Subagent event payloads are not reliably correlatable here. Do not
    // fabricate a completion or attach one to an unrelated running tool.

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
