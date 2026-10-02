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
