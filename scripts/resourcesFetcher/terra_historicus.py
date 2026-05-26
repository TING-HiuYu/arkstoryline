from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


TERRA_HISTORICUS_URL = "https://comic.hypergryph.com/terra-historicus/"


@dataclass(frozen=True, slots=True)
class TerraHistoricusComic:
    cid: str
    title: str
    cover: str
    url: str
    subtitle: str = ""
    authors: tuple[str, ...] = ()
    cover_path: str = ""
    kind: str = "terraHistoricusComic"


def fetch_terra_historicus_html(url: str = TERRA_HISTORICUS_URL) -> str:
    request = Request(url, headers={"User-Agent": "ArkStoryline/0.1"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def parse_terra_historicus_comics(
    html: str,
    base_url: str = TERRA_HISTORICUS_URL,
) -> list[TerraHistoricusComic]:
    match = re.search(
        r"window\.g_initialProps\s*=\s*(\{.*?\});\s*</script>",
        html,
        re.S,
    )
    if not match:
        raise ValueError("window.g_initialProps.comic.comicList not found")

    payload = json.loads(match.group(1))
    raw_comics = payload.get("comic", {}).get("comicList")
    if not isinstance(raw_comics, list):
        raise ValueError("window.g_initialProps.comic.comicList is not a list")

    comics: list[TerraHistoricusComic] = []
    for raw_item in raw_comics:
        if not isinstance(raw_item, dict):
            continue

        cid = str(raw_item.get("cid") or "").strip()
        title = str(raw_item.get("title") or "").strip()
        cover = str(raw_item.get("cover") or "").strip()
        if not cid or not title or not cover:
            continue

        authors = raw_item.get("authors")
        comics.append(
            TerraHistoricusComic(
                cid=cid,
                title=title,
                subtitle=str(raw_item.get("subtitle") or "").strip(),
                cover=cover,
                url=urljoin(base_url, f"comic/{cid}"),
                authors=(
                    tuple(str(author) for author in authors if author)
                    if isinstance(authors, list)
                    else ()
                ),
            )
        )

    return comics


def write_terra_historicus_index(
    output_dir: Path,
    comics: list[TerraHistoricusComic],
    source_url: str = TERRA_HISTORICUS_URL,
) -> Path:
    index_path = output_dir / "terra-historicus" / "index.json"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "source": {
            "providerId": "hypergryph-comic",
            "url": source_url,
        },
        "comics": [
            {
                "cid": comic.cid,
                "kind": comic.kind,
                "title": comic.title,
                "subtitle": comic.subtitle,
                "cover": comic.cover,
                "coverPath": comic.cover_path,
                "url": comic.url,
                "authors": list(comic.authors),
            }
            for comic in comics
        ],
    }
    index_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return index_path


def sync_terra_historicus_index(
    output_dir: Path,
    url: str = TERRA_HISTORICUS_URL,
    rendered_fixture: Path | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    html = (
        rendered_fixture.read_text(encoding="utf-8")
        if rendered_fixture
        else fetch_terra_historicus_html(url)
    )
    comics = parse_terra_historicus_comics(html, url)
    index_path = output_dir / "terra-historicus" / "index.json"

    if not dry_run:
        index_path = write_terra_historicus_index(output_dir, comics, url)

    return {
        "terraHistoricusIndexPath": str(index_path),
        "report": {
            "sourceUrl": url,
            "comicCount": len(comics),
            "withCoverSource": sum(1 for comic in comics if comic.cover),
            "dryRun": dry_run,
        },
    }
