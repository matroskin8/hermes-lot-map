"""Start the Codex companion and print a URL for one chat."""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent


def ensure(port):
    url = f"http://127.0.0.1:{port}"

    def ready():
        try:
            with urlopen(url + "/api/health", timeout=0.5) as response:
                return json.load(response).get("app") == "hermes-lot-map-codex"
        except Exception:
            return False

    if not ready():
        data = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "hermes-lot-map"
        data.mkdir(parents=True, exist_ok=True)
        with (data / "server.log").open("ab") as log:
            process = subprocess.Popen(
                [sys.executable, str(ROOT / "server.py"), "--port", str(port)],
                stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True,
            )
        for _ in range(30):
            if ready():
                break
            if process.poll() is not None:
                raise RuntimeError(f"Map server failed; see {data / 'server.log'}")
            time.sleep(0.1)
        else:
            raise RuntimeError("Map server did not become ready")
    return url


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", default="")
    parser.add_argument("--port", type=int, default=4321)
    args = parser.parse_args()
    print(ensure(args.port) + "/?" + urlencode({"session": args.session, "pane": "1"}))
