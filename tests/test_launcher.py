import json
import os
import socket
import subprocess
import sys
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

from app.runtime import instance_id, revision_id
from scripts.check_server import server_status


@contextmanager
def server(payload):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        def log_message(self, *args):
            pass

    http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield http.server_port
    finally:
        http.shutdown()
        http.server_close()
        thread.join()


def test_available_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    assert server_status(port) == "available"


def test_same_instance_and_different_workspace():
    with server(
        {"status": "ok", "application": "pm-site", "instance": "synthetic-instance", "revision": revision_id()}
    ) as port:
        assert server_status(port, "synthetic-instance") == "same"
        assert server_status(port, "other-instance") == "occupied"


def test_stale_instance():
    with server({"status": "ok", "application": "pm-site", "instance": "synthetic-instance"}) as port:
        assert server_status(port, "synthetic-instance") == "stale"


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "ok", "version": "0.1.0"},
        {"application": "other-app", "instance": "synthetic-instance"},
        [],
    ],
)
def test_unrecognized_service_is_not_reused(payload):
    with server(payload) as port:
        assert server_status(port, "synthetic-instance") == "occupied"


def test_health_identity_has_no_local_paths(client, tmp_path):
    health = client.get("/api/health").json()
    assert health["application"] == "pm-site"
    assert health["instance"] == instance_id(client.app.state.store.directory)
    assert str(tmp_path) not in json.dumps(health)


@pytest.mark.skipif(sys.platform != "win32", reason="Windows launcher integration")
@pytest.mark.parametrize("matching", [True, False])
def test_windows_launcher_refuses_unverified_process(tmp_path, matching):
    root = Path(__file__).resolve().parents[1]
    expected = instance_id(tmp_path)
    with server(
        {"status": "ok", "application": "pm-site", "instance": expected if matching else "other-instance"}
    ) as port:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(root / "scripts/start.ps1"),
                "-Port",
                str(port),
                "-NoBrowser",
            ],
            cwd=root,
            env={**os.environ, "PM_DATA_DIR": str(tmp_path)},
            capture_output=True,
            timeout=15,
        )
        assert result.returncode != 0
        assert server_status(port, expected) == ("stale" if matching else "occupied")
