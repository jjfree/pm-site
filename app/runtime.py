"""Local instance identity without exposing filesystem paths."""

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def instance_id(directory=None):
    data = Path(directory or os.getenv("PM_DATA_DIR", ROOT / "data")).resolve()
    paths = [os.path.normcase(str(ROOT.resolve())), os.path.normcase(str(data))]
    return hashlib.sha256(json.dumps(paths).encode()).hexdigest()


def revision_id():
    digest = hashlib.sha256()
    for relative in ("app/api.py", "app/models.py", "app/analytics.py", "app/static/index.html"):
        path = ROOT / relative
        digest.update(relative.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]
