"""Codex hook that stores event metadata without changing agent execution."""

import datetime
import json
import os
import re
import sys
from pathlib import Path


def record(data):
    session_id = str(data.get("session_id", ""))
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", session_id):
        return
    folder = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "hermes-lot-map" / "events"
    folder.mkdir(parents=True, exist_ok=True)
    response = data.get("tool_response") or {}
    row = {
        "time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": str(data.get("hook_event_name", ""))[:80],
        "tool": str(data.get("tool_name", ""))[:160],
        "call_id": str(data.get("tool_use_id") or data.get("call_id") or "")[:160],
        "agent": str(data.get("agent_id", ""))[:160],
        "model": str(data.get("model", ""))[:100],
        "error": isinstance(response, dict) and (
            response.get("isError") is True or response.get("is_error") is True
            or response.get("exit_code", 0) not in (0, None)
        ),
    }
    target = folder / f"{session_id}.jsonl"
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.write(descriptor, (json.dumps(row) + "\n").encode())
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        record(json.load(sys.stdin))
    except Exception:
        pass  # A visualization failure must not interrupt Codex.
