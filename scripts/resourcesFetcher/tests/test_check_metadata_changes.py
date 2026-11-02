from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.check_metadata_changes import INDEX_COLLECTIONS, detect_metadata_changes, main


class MetadataChangesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        (self.root / ".gitignore").write_text("public/data/\n", encoding="utf-8")
        self.originals: dict[str, bytes] = {}
        for path, collection in INDEX_COLLECTIONS.items():
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            entries = {"mainline": [{"title": "Original"}]} if collection == "sections" else [{"title": "Original"}]
            target.write_text(
                json.dumps({"generatedAt": "old", collection: entries}), encoding="utf-8"
            )
            self.originals[path] = target.read_bytes()
        self.git("add", ".gitignore")
        self.git("add", "--force", "public/data")
        self.git("commit", "-m", "Initial metadata")

    def git(self, *args: str) -> str:
        return subprocess.check_output(
            ["git", *args], cwd=self.root, text=True, stderr=subprocess.PIPE
        ).strip()

    def rewrite(self, path: str, **updates: object) -> None:
        target = self.root / path
        payload = json.loads(target.read_text(encoding="utf-8"))
        payload.update(updates)
        target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    def test_timestamps_and_formatting_do_not_trigger_a_build(self) -> None:
        for path in INDEX_COLLECTIONS:
            self.rewrite(path, generatedAt="new")
        self.assertFalse(detect_metadata_changes(self.root))
        for path, original in self.originals.items():
            self.assertEqual((self.root / path).read_bytes(), original)
        self.assertEqual(self.git("diff", "--name-only"), "")

    def test_content_changes_trigger_a_build_and_preserve_unchanged_indexes(self) -> None:
        for path in INDEX_COLLECTIONS:
            self.rewrite(path, generatedAt="new")
        changed_path = "public/data/operator/index.json"
        self.rewrite(changed_path, operators=[{"title": "New operator"}])
        self.assertTrue(detect_metadata_changes(self.root))
        self.assertEqual(self.git("diff", "--name-only"), changed_path)

    def test_new_index_triggers_a_build(self) -> None:
        self.git("rm", "--cached", "public/data/operator/index.json")
        self.git("commit", "-m", "Remove tracked index")
        self.assertTrue(detect_metadata_changes(self.root))

    def test_empty_fetch_fails_instead_of_creating_a_destructive_pr(self) -> None:
        for path, collection in INDEX_COLLECTIONS.items():
            with self.subTest(path=path):
                original = (self.root / path).read_bytes()
                self.rewrite(path, **{collection: {} if collection == "sections" else []})
                with self.assertRaisesRegex(ValueError, "empty or invalid"):
                    detect_metadata_changes(self.root)
                (self.root / path).write_bytes(original)

    def test_invalid_json_fails(self) -> None:
        (self.root / "public/data/operator/index.json").write_text("{", encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            detect_metadata_changes(self.root)

    def test_missing_index_fails(self) -> None:
        (self.root / "public/data/operator/index.json").unlink()
        with self.assertRaises(FileNotFoundError):
            detect_metadata_changes(self.root)

    def test_step_output_matches_change_detection(self) -> None:
        output = self.root / "output"
        with patch("scripts.check_metadata_changes.Path.cwd", return_value=self.root):
            with patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}):
                main()
                self.rewrite("public/data/operator/index.json", operators=[{"title": "New"}])
                main()
        self.assertEqual(output.read_text(encoding="utf-8"), "changed=false\nchanged=true\n")


if __name__ == "__main__":
    unittest.main()
