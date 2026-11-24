"""Read-only, loopback companion for the Hermes Lot Map Codex pane."""

import argparse
import datetime
import json
import os
import re
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
CODEX_HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
SESSIONS = CODEX_HOME / "sessions"
HOOKS = CODEX_HOME / "hermes-lot-map" / "events"
STATE = CODEX_HOME / "state_5.sqlite"
SESSION_ID = re.compile(r"[A-Za-z0-9_-]{1,160}\Z")
STATIC = {
    "/": (ROOT / "codex" / "index.html", "text/html; charset=utf-8"),
    "/app.js": (ROOT / "codex" / "app.js", "text/javascript; charset=utf-8"),
    "/style.css": (ROOT / "codex" / "style.css", "text/css; charset=utf-8"),
    **{
        f"/desktop/{name}": (ROOT / "desktop" / name, "text/javascript; charset=utf-8")
        for name in ("map-renderer.js", "map-reconcile.js", "route-generator.js", "overlay-engine.js")
    },
}


def classify(name):
    name = name.lower()
    if any(word in name for word in ("agent", "spawn", "collaboration", "thread")):
        return "agents"
    if any(word in name for word in ("browser", "cua", "screenshot")):
        return "browser"
    if any(word in name for word in ("hindsight", "memory", "recall")):
        return "memory"
    if any(word in name for word in ("patch", "file", "read", "write")):
        return "files"
    if any(word in name for word in ("exec", "stdin", "shell", "terminal", "bash")):
        return "shell"
    if any(word in name for word in ("web", "fetch", "search")):
        return "web"
    if "skill" in name:
        return "skills"
    return "skills"


def session_files():
    return sorted(SESSIONS.glob("*/*/*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:100]


def session_titles(ids):
    if not ids:
        return {}
    try:
        with sqlite3.connect(f"{STATE.as_uri()}?mode=ro", uri=True) as database:
            rows = database.execute(
                f"SELECT id, COALESCE(NULLIF(name, ''), NULLIF(title, '')) FROM threads WHERE id IN ({','.join('?' for _ in ids)})",
                ids,
            )
            return {session_id: title for session_id, title in rows if title}
    except sqlite3.Error:
        return {}


def parse_session(path):
    meta = {}
    events = []
    calls = {}
    model = "Codex"
    context = None
    state = "idle"
    with path.open(encoding="utf-8") as source:
        for index, line in enumerate(source):
            try:
                row = json.loads(line)
            except (ValueError, UnicodeError):
                continue
            payload = row.get("payload") or {}
            kind = payload.get("type")
            stamp = row.get("timestamp", "")
            if row.get("type") == "session_meta":
                meta = payload
            elif row.get("type") == "turn_context":
                model = payload.get("model") or model
            if kind in ("task_started", "turn_started"):
                state = "working"
            elif kind in ("task_complete", "task_completed", "turn_aborted"):
                state = "idle"
                for pending in calls.values():
                    if pending["status"] == "running":
                        pending.update(status="unknown", completed=stamp)
                events.append(dict(id=f"answer-{index}", station="you", label="Answer ready" if kind != "turn_aborted" else "Turn interrupted", status="done", time=stamp))
            elif kind == "token_count":
                info = payload.get("info") or {}
                usage = info.get("last_token_usage") or {}
                window = info.get("model_context_window")
                if window:
                    context = round(100 * usage.get("total_tokens", 0) / window, 1)
            if row.get("type") != "response_item":
                continue
            if kind in ("function_call", "custom_tool_call"):
                name = ".".join(filter(None, (payload.get("namespace"), payload.get("name")))) or "tool"
                call_id = payload.get("call_id") or payload.get("id") or str(index)
                event = dict(id=f"call-{call_id}", call_id=call_id, station=classify(name), label=name[:160], status="running", time=stamp)
                calls[call_id] = event
                events.append(event)
            elif kind in ("function_call_output", "custom_tool_call_output"):
                event = calls.get(payload.get("call_id"))
                if event:
                    output = str(payload.get("output", ""))[:2000]
                    failed = re.search(r'"(?:isError|is_error)"\s*:\s*true|"exit_code"\s*:\s*[1-9]|Process exited with code [1-9]', output)
                    event.update(status="error" if failed else "done", completed=stamp)
            elif kind == "message" and payload.get("role") == "user":
                events.append(dict(id=f"log-{index}", station="you", label="Message received", status="done", time=stamp))
            elif kind == "reasoning":
                events.append(dict(id=f"log-{index}", station="model", label="Model step", status="done", time=stamp))
            elif kind == "message" and payload.get("role") == "assistant" and payload.get("phase") == "final":
                state = "idle"
                for pending in calls.values():
                    if pending["status"] == "running":
                        pending.update(status="unknown", completed=stamp)
    result = dict(id=meta.get("id", path.stem), name=Path(meta.get("cwd", "Unknown workspace")).name,
                  model=model, context=context, state=state, events=events[-250:], source="Local session log")
    return with_hooks(result)


def with_hooks(session):
    session_id = session["id"]
    if not SESSION_ID.fullmatch(session_id):
        return session
    path = HOOKS / f"{session_id}.jsonl"
    if not path.exists():
        return session
    events = []
    calls = {}
    agents = {}
    models = []
    hooked_calls = set()
    terminal_times = []
    with path.open(encoding="utf-8") as source:
        for index, line in enumerate(source):
            try:
                row = json.loads(line)
                stamp = row["time"]
            except (ValueError, KeyError):
                continue
            kind = row.get("event")
            tool = row.get("tool") or "Tool"
            key = row.get("call_id")
            event = dict(id=f"call-{key}" if key and kind in ("PreToolUse", "PostToolUse") else f"hook-{index}",
                         station=classify(tool), label=tool, status="done", time=stamp)
            if kind == "PreToolUse":
                event["status"] = "running"
                if key:
                    calls.setdefault(key, []).append(event)
                    hooked_calls.add(key)
                events.append(event)
            elif kind == "PostToolUse":
                if key:
                    hooked_calls.add(key)
                pending = calls.get(key, []) if key else []
                target = pending.pop(0) if pending else event
                target.update(status="error" if row.get("error") else "done", completed=stamp)
                if target is event:
                    events.append(event)
            elif kind == "PreModelRequest":
                event.update(station="model", label="Model request", status="running")
                models.append(event)
                events.append(event)
            elif kind == "PostModelRequest":
                if models:
                    models.pop(0).update(status="done", completed=stamp)
            elif kind == "SubagentStart":
                event.update(station="agents", label="Subagent", status="running")
                agents[row.get("agent") or str(index)] = event
                events.append(event)
            elif kind == "SubagentStop":
                agent = agents.get(row.get("agent"))
                if agent:
                    agent.update(status="done", completed=stamp)
            elif kind in ("UserPromptSubmit", "SessionStart"):
                event.update(station="you", label="Message received" if kind == "UserPromptSubmit" else "Session connected")
                events.append(event)
                if kind == "UserPromptSubmit":
                    session["state"] = "working"
            elif kind in ("Stop", "Interrupt", "SessionEnd"):
                session["state"] = "idle"
                terminal_times.append(stamp)
                for pending in events:
                    if pending["status"] == "running":
                        pending.update(status="unknown", completed=stamp)
                event.update(station="you", label="Answer ready" if kind == "Stop" else kind)
                events.append(event)
            elif kind in ("PreCompact", "PostCompact"):
                event.update(station="model", label="Context compaction")
                events.append(event)
            if row.get("model"):
                session["model"] = row["model"]
    if events:
        first = events[0]["time"]
        first_time = datetime.datetime.fromisoformat(first.replace("Z", "+00:00"))
        log_events = []
        for event in session["events"]:
            if not event["time"]:
                continue
            stamp = datetime.datetime.fromisoformat(event["time"].replace("Z", "+00:00"))
            if stamp < first_time or (event.get("call_id") and event["call_id"] not in hooked_calls):
                log_events.append(event)
        # Hook and log IDs can differ for one call. Keep one flight with the
        # hook ID, then use the log result if PostToolUse never arrives.
        for event in events[:]:
            if not event["id"].startswith("call-"):
                continue
            started = datetime.datetime.fromisoformat(event["time"].replace("Z", "+00:00"))
            match = next((logged for logged in session["events"]
                          if logged["station"] == event["station"]
                          and logged.get("call_id")
                          and abs((datetime.datetime.fromisoformat(logged["time"].replace("Z", "+00:00")) - started).total_seconds()) < 2), None)
            if match:
                if event["status"] == "running" and match["status"] != "running":
                    match["id"] = event["id"]
                    events.remove(event)
                    if match not in log_events:
                        log_events.append(match)
                elif match in log_events:
                    log_events.remove(match)
        terminals = [(stamp, datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")))
                     for stamp in terminal_times]
        for event in log_events:
            if event["status"] != "running":
                continue
            started = datetime.datetime.fromisoformat(event["time"].replace("Z", "+00:00"))
            completion = next((stamp for stamp, time in terminals if time >= started), None)
            if completion:
                event.update(status="unknown", completed=completion)
        merged = log_events + events
        merged.sort(key=lambda event: datetime.datetime.fromisoformat(event["time"].replace("Z", "+00:00")))
        for event in merged:
            event.pop("call_id", None)
        session["events"] = merged[-250:]
        session["source"] = "Lifecycle hooks + local session log"
    return session


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            return self.send_json({"app": "hermes-lot-map-codex", "version": "0.1.0"})
        if url.path == "/api/state":
            wanted = parse_qs(url.query).get("session", [""])[0]
            files = session_files()
            candidates = []
            selected = None
            seen = set()
            for path in files:
                try:
                    with path.open(encoding="utf-8") as source:
                        meta = (json.loads(source.readline()).get("payload") or {})
                    session_id = meta.get("id", path.stem)
                    if session_id in seen:
                        continue
                    seen.add(session_id)
                    candidates.append((session_id, Path(meta.get("cwd", "Unknown")).name))
                    if session_id == wanted or (not wanted and selected is None):
                        selected = path
                except (OSError, ValueError):
                    continue
            titles = session_titles([session_id for session_id, _ in candidates])
            summaries = [dict(id=session_id, name=titles.get(session_id, workspace))
                         for session_id, workspace in candidates]
            return self.send_json(dict(sessions=summaries, session=parse_session(selected) if selected else None))
        asset = STATIC.get(url.path)
        if asset is None:
            self.send_error(404)
            return
        path, content_type = asset
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4321)
    args = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
