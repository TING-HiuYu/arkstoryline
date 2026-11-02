from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


INDEX_COLLECTIONS = {
    "public/data/storyline/index.json": "sections",
    "public/data/operator/index.json": "operators",
    "public/data/terra-historicus/index.json": "comics",
}


def comparable_metadata(text: str, collection: str) -> dict[str, object]:
    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("Metadata index must be a JSON object")
    entries = payload.get(collection)
    if collection == "sections":
        valid = (
            isinstance(entries, dict)
            and bool(entries)
            and all(isinstance(value, list) for value in entries.values())
            and any(entries.values())
        )
    else:
        valid = isinstance(entries, list) and bool(entries)
    if not valid:
        raise ValueError(f"Metadata index has an empty or invalid {collection} collection")
    payload.pop("generatedAt", None)
    return payload


def detect_metadata_changes(root: Path) -> bool:
    changed = False
    for relative_path, collection in INDEX_COLLECTIONS.items():
        path = root / relative_path
        current = comparable_metadata(path.read_text(encoding="utf-8"), collection)
        tracked = subprocess.check_output(
            ["git", "ls-tree", "--name-only", "HEAD", "--", relative_path],
            cwd=root,
            text=True,
        ).strip()
        if not tracked:
            print(f"New metadata: {relative_path}")
            changed = True
            continue
        previous_bytes = subprocess.check_output(
            ["git", "show", f"HEAD:{relative_path}"], cwd=root
        )
        previous = comparable_metadata(previous_bytes.decode("utf-8"), collection)
        if current != previous:
            print(f"Changed metadata: {relative_path}")
            changed = True
        else:
            path.write_bytes(previous_bytes)
    return changed


def main() -> None:
    changed = detect_metadata_changes(Path.cwd())
    message = (
        "Metadata changed; continuing with the data rebuild."
        if changed
        else "No metadata changes; skipping build and pull request."
    )
    print(message)
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"changed={str(changed).lower()}\n")


if __name__ == "__main__":
    main()
