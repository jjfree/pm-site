import importlib.util
from pathlib import Path
from scripts.restore import restore
from app.db import Store


def load_guard():
    spec = importlib.util.spec_from_file_location(
        "guard", Path(__file__).parents[1] / "scripts/publication_guard.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_guard_reads_custom_rules_without_echo():
    guard = load_guard()
    assert guard.check_blob("data/customer.csv", b"hello")
    assert guard.check_blob("README.md", b"Private-Acme", ["private-acme"])
    assert guard.check_blob("app/demo.py", b"synthetic values") == []
    assert guard.check_blob("frontend/src/issueTimeline.ts", b"export const x = 1") == []
    assert guard.check_blob("frontend/tests/issueTimeline.test.mjs", b"export const x = 1") == []
    assert guard.check_blob("app/static/assets/main.js", b"C:/Users/PrivateUser", ["PrivateUser"])
    assert guard.check_blob("app/demo.py", b"ghp_" + b"a" * 36)


def test_restore_preserves_previous_database(tmp_path):
    original = Store(tmp_path / "original")
    original.write("projects", {"name": "Before"})
    backup = original.backup()
    destination = Store(tmp_path / "destination")
    destination.write("projects", {"name": "Other"})
    restore(backup, destination.directory)
    assert destination.list("projects")[0]["name"] == "Before"
    assert len(list((destination.directory / "backups").glob("before-restore-*.sqlite3"))) == 1
