"""Classify a loopback port as available, this instance, or occupied."""

import argparse
import http.client
import json
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.runtime import instance_id  # noqa: E402


def server_status(port, expected=None):
    try:
        # Windows may take about two seconds to report connection refusal.
        with socket.create_connection(("127.0.0.1", port), timeout=3):
            pass
    except ConnectionRefusedError:
        return "available"
    except OSError:
        return "occupied"
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", "/api/health")
        response = connection.getresponse()
        content = response.read(4097)
        if response.status != 200 or len(content) > 4096:
            return "occupied"
        health = json.loads(content)
        if (
            isinstance(health, dict)
            and health.get("status") == "ok"
            and health.get("application") == "pm-site"
            and health.get("instance") == (expected or instance_id())
        ):
            return "same"
    except (OSError, ValueError, http.client.HTTPException):
        pass
    finally:
        connection.close()
    return "occupied"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", type=int, choices=range(1, 65536), metavar="PORT")
    print(server_status(parser.parse_args().port))
