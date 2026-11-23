import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class CodexEventTest(unittest.TestCase):
    def test_session_titles_use_display_name(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state.sqlite"
            with sqlite3.connect(state) as database:
                database.execute("CREATE TABLE threads (id TEXT, title TEXT, name TEXT)")
                database.executemany("INSERT INTO threads VALUES (?, ?, ?)", [
                    ("named", "First user message", "My chat title"),
                    ("untitled", "First user message", None),
                ])
            with patch.object(server, "STATE", state):
                self.assertEqual(server.session_titles(["named", "untitled", "missing"]), {
                    "named": "My chat title",
                    "untitled": "First user message",
                })

    def test_hooks_replace_overlapping_log_events_and_pair_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session_id = "session-123"
            log = root / "session.jsonl"
            rows = [
                {"timestamp": "2026-01-01T00:00:00Z", "type": "session_meta", "payload": {"id": session_id, "cwd": "/tmp/project"}},
                {"timestamp": "2026-01-01T00:00:01Z", "type": "response_item", "payload": {"type": "function_call", "name": "old_tool", "call_id": "old", "arguments": "private text"}},
                {"timestamp": "2026-01-01T00:00:02Z", "type": "event_msg", "payload": {"type": "token_count", "info": {"last_token_usage": {"total_tokens": 100}, "model_context_window": 1000}}},
            ]
            log.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
            hooks = root / f"{session_id}.jsonl"
            hook_rows = [
                {"time": "2026-01-01T00:00:03Z", "event": "PreToolUse", "tool": "mcp__cua_repl__js", "call_id": "call", "error": False},
                {"time": "2026-01-01T00:00:04Z", "event": "PostToolUse", "tool": "mcp__cua_repl__js", "call_id": "call", "error": True},
                {"time": "2026-01-01T00:00:05Z", "event": "PreModelRequest", "model": "gpt-6"},
                {"time": "2026-01-01T00:00:06Z", "event": "PostModelRequest"},
            ]
            hooks.write_text("\n".join(json.dumps(row) for row in hook_rows) + "\n")
            with patch.object(server, "HOOKS", root):
                result = server.parse_session(log)
            self.assertEqual(result["context"], 10)
            self.assertEqual(result["model"], "gpt-6")
            self.assertEqual([(event["station"], event["status"]) for event in result["events"]],
                             [("skills", "running"), ("browser", "error"), ("model", "done")])
            self.assertEqual(result["events"][1]["completed"], "2026-01-01T00:00:04Z")
            self.assertNotIn("private text", json.dumps(result))

    def test_missing_call_id_does_not_close_another_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session_id = "session-456"
            log = root / "session.jsonl"
            log.write_text(json.dumps({"timestamp": "2026-01-01T00:00:00Z", "type": "session_meta", "payload": {"id": session_id}}) + "\n")
            hooks = root / f"{session_id}.jsonl"
            rows = [
                {"time": "2026-01-01T00:00:01+00:00", "event": "PreToolUse", "tool": "exec", "call_id": "one"},
                {"time": "2026-01-01T00:00:02+00:00", "event": "PostToolUse", "tool": "exec"},
                {"time": "2026-01-01T00:00:03+00:00", "event": "Interrupt"},
            ]
            hooks.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
            with patch.object(server, "HOOKS", root):
                result = server.parse_session(log)
            self.assertEqual([event["status"] for event in result["events"]], ["unknown", "done", "done"])
            self.assertEqual(result["events"][0]["completed"], rows[-1]["time"])

    def test_log_only_errors_and_unfinished_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / "session.jsonl"
            rows = [
                ("2026-01-01T00:00:00Z", "session_meta", {"id": "session-789"}),
                ("2026-01-01T00:00:01Z", "response_item", {"type": "function_call", "name": "exec", "call_id": "failed"}),
                ("2026-01-01T00:00:02Z", "response_item", {"type": "function_call_output", "call_id": "failed", "output": '{"exit_code": 1}'}),
                ("2026-01-01T00:00:03Z", "response_item", {"type": "function_call", "name": "exec", "call_id": "lost"}),
                ("2026-01-01T00:00:04Z", "event_msg", {"type": "task_complete"}),
            ]
            log.write_text("\n".join(json.dumps({"timestamp": time, "type": outer, "payload": payload}) for time, outer, payload in rows) + "\n")
            with patch.object(server, "HOOKS", Path(directory) / "absent"):
                result = server.parse_session(log)
            self.assertEqual([event["status"] for event in result["events"]], ["error", "unknown", "done"])
            self.assertEqual(result["events"][1]["completed"], "2026-01-01T00:00:04Z")

    def test_unhooked_tool_after_first_hook_is_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session_id = "session-merge"
            log = root / "session.jsonl"
            rows = [
                {"timestamp": "2026-01-01T00:00:00Z", "type": "session_meta", "payload": {"id": session_id}},
                {"timestamp": "2026-01-01T00:00:02Z", "type": "response_item", "payload": {"type": "function_call", "name": "exec", "call_id": "covered"}},
                {"timestamp": "2026-01-01T00:00:03Z", "type": "response_item", "payload": {"type": "function_call", "name": "web_search", "call_id": "uncovered"}},
            ]
            log.write_text("\n".join(json.dumps(row) for row in rows) + "\n")
            hooks = root / f"{session_id}.jsonl"
            hooks.write_text(json.dumps({"time": "2026-01-01T00:00:01+00:00", "event": "PreToolUse", "tool": "exec", "call_id": "covered"}) + "\n")
            with patch.object(server, "HOOKS", root):
                result = server.parse_session(log)
            self.assertEqual([(event["label"], event["station"]) for event in result["events"]],
                             [("exec", "shell"), ("web_search", "web")])

    def test_stop_closes_unhooked_calls_from_its_cycle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            session_id = "session-stop"
            log = root / "session.jsonl"
            rows = [
                ("2026-01-01T00:00:00Z", "session_meta", {"id": session_id}),
                ("2026-01-01T00:00:02Z", "response_item", {"type": "function_call", "name": "exec", "call_id": "before"}),
                ("2026-01-01T00:00:05Z", "response_item", {"type": "function_call", "name": "web_search", "call_id": "after"}),
            ]
            log.write_text("\n".join(json.dumps({"timestamp": time, "type": outer, "payload": payload})
                                     for time, outer, payload in rows) + "\n")
            hooks = root / f"{session_id}.jsonl"
            hook_rows = [
                {"time": "2026-01-01T00:00:01Z", "event": "SessionStart"},
                {"time": "2026-01-01T00:00:04Z", "event": "Stop"},
            ]
            hooks.write_text("\n".join(json.dumps(row) for row in hook_rows) + "\n")
            with patch.object(server, "HOOKS", root):
                result = server.parse_session(log)
            calls = {event["label"]: event for event in result["events"] if event["label"] in ("exec", "web_search")}
            self.assertEqual(calls["exec"]["status"], "unknown")
            self.assertEqual(calls["exec"]["completed"], "2026-01-01T00:00:04Z")
            self.assertEqual(calls["web_search"]["status"], "running")


if __name__ == "__main__":
    unittest.main()
