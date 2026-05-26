from __future__ import annotations

import json
import re
from hashlib import sha1
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .storyline_index import build_story_page_url

PART_BY_AVG_TAG = {
    "行动前": "BEG",
    "行动后": "END",
    "幕间": "NBT",
}


@dataclass(frozen=True, slots=True)
class StoryContentSource:
    page: str
    url: str
    chapter_title: str
    section: str

    def as_json(self) -> dict[str, str]:
        return {
            "provider": "prts",
            "url": self.url,
            "page": self.page,
            "kind": "scenario-html",
        }


def sync_story_content_sources(
    *,
    storyline_index_path: Path,
    output_dir: Path,
    locale: str,
    dry_run: bool = False,
) -> dict[str, object]:
    storyline_index = json.loads(storyline_index_path.read_text(encoding="utf-8"))
    sources = build_story_content_source_lookup(storyline_index)
    album_dir = output_dir / locale / "albums"
    chapter_dir = output_dir / locale / "chapters"
    catalog_path = output_dir / locale / "catalog.json"
    search_index_path = output_dir / locale / "search-index.json"
    changed_albums: list[str] = []
    changed_chapters: list[str] = []
    missing: list[dict[str, str]] = []

    other_story_result = upsert_other_story_albums(
        storyline_index=storyline_index,
        catalog_path=catalog_path,
        album_dir=album_dir,
        chapter_dir=chapter_dir,
        search_index_path=search_index_path,
        locale=locale,
        dry_run=dry_run,
    )

    for album_path in sorted(album_dir.glob("*.json")):
        album = json.loads(album_path.read_text(encoding="utf-8"))
        album_changed = False
        album_sections = album_sections_for_album_kind(str(album.get("albumKind", "")))

        for chapter in album.get("chapters", []):
            if not isinstance(chapter, dict):
                continue

            existing_content_source = chapter.get("contentSource")
            if isinstance(existing_content_source, dict) and existing_content_source.get("url"):
                chapter_id = chapter.get("id")
                if isinstance(chapter_id, str):
                    sync_chapter_content_source(
                        chapter_dir=chapter_dir,
                        chapter_id=chapter_id,
                        content_source=existing_content_source,
                        changed_chapters=changed_chapters,
                        dry_run=dry_run,
                    )
                continue

            source = resolve_chapter_content_source(chapter, sources, album_sections)
            if source is None:
                missing.append(
                    {
                        "albumId": str(album.get("id", "")),
                        "chapterId": str(chapter.get("id", "")),
                        "title": str(chapter.get("title", "")),
                    }
                )
                continue

            content_source = source.as_json()
            if chapter.get("contentSource") != content_source:
                chapter["contentSource"] = content_source
                album_changed = True

            chapter_id = chapter.get("id")
            if not isinstance(chapter_id, str):
                continue

            sync_chapter_content_source(
                chapter_dir=chapter_dir,
                chapter_id=chapter_id,
                content_source=content_source,
                changed_chapters=changed_chapters,
                dry_run=dry_run,
            )

        if album_changed:
            changed_albums.append(str(album_path))
            if not dry_run:
                album_path.write_text(
                    json.dumps(album, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "storylineIndexPath": str(storyline_index_path),
        "changedAlbums": len(changed_albums),
        "changedChapters": len(changed_chapters),
        "otherStoryAlbums": other_story_result["albumCount"],
        "otherStoryChapters": other_story_result["chapterCount"],
        "missing": len(missing),
        "missingSamples": missing[:50],
        "dryRun": dry_run,
    }
    diagnostics_path = output_dir / ".diagnostics" / "story-content-sources-report.json"
    if not dry_run:
        diagnostics_path.parent.mkdir(parents=True, exist_ok=True)
        diagnostics_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    return {
        "diagnosticsPath": str(diagnostics_path),
        "changedAlbums": changed_albums,
        "changedChapters": changed_chapters,
        "otherStory": other_story_result,
        "report": report,
    }


def upsert_other_story_albums(
    *,
    storyline_index: dict[str, Any],
    catalog_path: Path,
    album_dir: Path,
    chapter_dir: Path,
    search_index_path: Path,
    locale: str,
    dry_run: bool,
) -> dict[str, object]:
    entries = read_other_story_entries(storyline_index)
    grouped_entries: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for entry in entries:
        group_title = str(entry.get("groupTitle") or "其他档案")
        album_title = str(entry.get("albumTitle") or entry.get("chapterTitle") or entry.get("title") or "附加档案")
        grouped_entries.setdefault((group_title, album_title), []).append(entry)

    album_payloads: list[dict[str, Any]] = []
    chapter_payloads: list[dict[str, Any]] = []

    for (group_title, album_title), group_entries in sorted(grouped_entries.items()):
        album_id = build_other_story_album_id(group_title, album_title)
        sorted_entries = group_entries
        chapters: list[dict[str, Any]] = []

        for index, entry in enumerate(sorted_entries):
            page = str(entry.get("page") or "")
            chapter_id = f"{album_id}--{stable_slug(page or str(index))}"
            chapter_title = str(entry.get("chapterTitle") or entry.get("title") or page or album_title)
            code, _, part = split_page(page)
            avg_tag = avg_tag_from_part(part)
            content_source = {
                "provider": "prts",
                "url": str(entry.get("sourceUrl") or build_story_page_url(page, base_url="https://prts.wiki/")),
                "page": page,
                "kind": "scenario-html",
            }
            chapter_ref = {
                "id": chapter_id,
                "title": chapter_title,
                "sort": index + 1,
                "contentSource": content_source,
            }
            if code:
                chapter_ref["code"] = code.upper()
            if avg_tag:
                chapter_ref["avgTag"] = avg_tag

            chapter_payloads.append(
                {
                    "id": chapter_id,
                    "albumId": album_id,
                    "title": chapter_title,
                    "subtitle": code.upper() if code else None,
                    "code": code.upper() if code else None,
                    "avgTag": avg_tag,
                    "navigation": {
                        "previousChapterId": None,
                        "nextChapterId": None,
                    },
                    "blocks": [],
                    "citations": [],
                    "contentSource": content_source,
                }
            )
            chapters.append(chapter_ref)

        for index, chapter in enumerate(chapter_payloads[-len(chapters) :]):
            chapter["navigation"] = {
                "previousChapterId": chapters[index - 1]["id"] if index > 0 else None,
                "nextChapterId": chapters[index + 1]["id"] if index < len(chapters) - 1 else None,
            }

        album_payloads.append(
            {
                "id": album_id,
                "slug": album_id,
                "title": album_title,
                "sourceEntryType": "ARCHIVE_EXTRA",
                "albumKind": "otherStory",
                "homeSection": "otherStory",
                "timelineRank": 900000000 + len(album_payloads),
                "gameOrderRank": 900000000 + len(album_payloads),
                "otherStory": {
                    "groupTitle": group_title,
                    "albumTitle": album_title,
                    "sourceSection": "other",
                },
                "chapters": chapters,
                "source": {
                    "providerId": "prts",
                    "revision": str(storyline_index.get("generatedAt") or ""),
                    "path": "storyline.index.sections.other",
                },
            }
        )

    if not dry_run:
        album_dir.mkdir(parents=True, exist_ok=True)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        remove_stale_other_story_files(
            album_dir=album_dir,
            chapter_dir=chapter_dir,
            active_album_ids={str(album["id"]) for album in album_payloads},
            active_chapter_ids={str(chapter["id"]) for chapter in chapter_payloads},
        )
        for album in album_payloads:
            write_json(album_dir / f"{album['id']}.json", album)
        for chapter in chapter_payloads:
            write_json(chapter_dir / f"{chapter['id']}.json", chapter)
        upsert_catalog_albums(catalog_path, album_payloads)
        upsert_search_entries(search_index_path, locale, album_payloads)

    return {
        "albumCount": len(album_payloads),
        "chapterCount": len(chapter_payloads),
        "albumIds": [str(album["id"]) for album in album_payloads],
        "dryRun": dry_run,
    }


def remove_stale_other_story_files(
    *,
    album_dir: Path,
    chapter_dir: Path,
    active_album_ids: set[str],
    active_chapter_ids: set[str],
) -> None:
    for album_path in album_dir.glob("other-story-*.json"):
        if album_path.stem not in active_album_ids:
            album_path.unlink()

    for chapter_path in chapter_dir.glob("other-story-*--*.json"):
        if chapter_path.stem not in active_chapter_ids:
            chapter_path.unlink()


def read_other_story_entries(storyline_index: dict[str, Any]) -> list[dict[str, Any]]:
    sections = storyline_index.get("sections", {})
    if not isinstance(sections, dict):
        return []

    entries: list[dict[str, Any]] = []
    for section_name in ("other", "cc"):
        section_entries = sections.get(section_name, [])
        if isinstance(section_entries, list):
            entries.extend(entry for entry in section_entries if isinstance(entry, dict))
    return entries


def sync_chapter_content_source(
    *,
    chapter_dir: Path,
    chapter_id: str,
    content_source: dict[str, Any],
    changed_chapters: list[str],
    dry_run: bool,
) -> None:
    chapter_path = chapter_dir / f"{chapter_id}.json"
    if not chapter_path.exists():
        return

    chapter_payload = json.loads(chapter_path.read_text(encoding="utf-8"))
    if chapter_payload.get("contentSource") == content_source:
        return

    chapter_payload["contentSource"] = content_source
    changed_chapters.append(str(chapter_path))
    if not dry_run:
        write_json(chapter_path, chapter_payload)


def upsert_catalog_albums(catalog_path: Path, album_payloads: list[dict[str, Any]]) -> None:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else {"albums": []}
    existing_albums = [album for album in catalog.get("albums", []) if isinstance(album, dict)]
    archive_ids = {album["id"] for album in album_payloads}
    retained_albums = [
        album
        for album in existing_albums
        if album.get("albumKind") != "otherStory" and album.get("id") not in archive_ids
    ]
    catalog["albums"] = retained_albums + [album_summary(album) for album in album_payloads]
    write_json(catalog_path, catalog)


def upsert_search_entries(search_index_path: Path, locale: str, album_payloads: list[dict[str, Any]]) -> None:
    if not search_index_path.exists():
        return

    search_index = json.loads(search_index_path.read_text(encoding="utf-8"))
    entries = [entry for entry in search_index.get("entries", []) if isinstance(entry, dict)]
    archive_album_ids = {album["id"] for album in album_payloads}
    retained_entries = [
        entry
        for entry in entries
        if entry.get("type") != "otherStory" and entry.get("albumId") not in archive_album_ids
    ]
    search_index["entries"] = retained_entries + [
        entry
        for album in album_payloads
        for entry in build_other_story_search_entries(locale, album)
    ]
    write_json(search_index_path, search_index)


def build_other_story_search_entries(locale: str, album: dict[str, Any]) -> list[dict[str, Any]]:
    album_id = str(album["id"])
    album_title = str(album["title"])
    entries = [
        {
            "id": f"album:{album_id}",
            "kind": "album",
            "locale": locale,
            "displayTitle": album_title,
            "displaySecondary": "附加档案",
            "albumId": album_id,
            "albumTitle": album_title,
            "type": "otherStory",
            "homeSection": "otherStory",
            "sortIndex": album.get("gameOrderRank", 0),
            "match": build_search_match(album_title, album_title, aliases=[album_id]),
            "target": {"route": "album", "albumId": album_id},
        }
    ]

    for chapter in album.get("chapters", []):
        if not isinstance(chapter, dict):
            continue
        chapter_id = str(chapter.get("id") or "")
        chapter_title = str(chapter.get("title") or "")
        chapter_code = str(chapter.get("code") or "")
        display_title = " ".join(part for part in [chapter_code, chapter_title] if part)
        entries.append(
            {
                "id": f"chapter:{chapter_id}",
                "kind": "chapter",
                "locale": locale,
                "displayTitle": display_title or chapter_title,
                "displaySecondary": album_title,
                "albumId": album_id,
                "albumTitle": album_title,
                "chapterId": chapter_id,
                "chapterTitle": chapter_title,
                "stageCode": chapter_code,
                "type": "otherStory",
                "homeSection": "otherStory",
                "sortIndex": chapter.get("sort", 0),
                "match": build_search_match(
                    display_title or chapter_title,
                    album_title,
                    chapter_title=chapter_title,
                    stage_code=chapter_code,
                    aliases=[chapter_id],
                ),
                "target": {"route": "chapter", "albumId": album_id, "chapterId": chapter_id},
            }
        )
    return entries


def build_search_match(
    title: str,
    album_title: str,
    *,
    chapter_title: str | None = None,
    stage_code: str | None = None,
    aliases: list[str] | None = None,
) -> dict[str, Any]:
    alias_values = [title, album_title, chapter_title, stage_code, *(aliases or [])]
    normalized_aliases = [value for value in alias_values if isinstance(value, str) and value]
    return {
        "title": title,
        "albumTitle": album_title,
        "chapterTitle": chapter_title,
        "stageCode": stage_code,
        "aliases": normalized_aliases,
        "tokens": sorted({normalize_token(value) for value in normalized_aliases if normalize_token(value)}),
        "exactIds": [value for value in [stage_code, *(aliases or [])] if value],
    }


def album_summary(album: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": album["id"],
        "title": album["title"],
        "slug": album["slug"],
        "sourceEntryType": album["sourceEntryType"],
        "albumKind": album["albumKind"],
        "homeSection": album["homeSection"],
        "timelineRank": album["timelineRank"],
        "gameOrderRank": album["gameOrderRank"],
        "chapterCount": len(album.get("chapters", [])),
        "otherStory": album.get("otherStory"),
    }


def avg_tag_from_part(part: str) -> str | None:
    if part == "BEG":
        return "行动前"
    if part == "END":
        return "行动后"
    if part == "NBT":
        return "幕间"
    return None


def build_other_story_album_id(group_title: str, album_title: str) -> str:
    digest = sha1(f"{group_title}|{album_title}".encode("utf-8")).hexdigest()[:10]
    return f"other-story-{stable_slug(album_title)}-{digest}"


def stable_slug(value: str) -> str:
    normalized = re.sub("[^0-9A-Za-z\u4e00-\u9fff]+", "-", value).strip("-").lower()
    if normalized:
        return normalized[:72]
    return sha1(value.encode("utf-8")).hexdigest()[:12]


def write_json(path: Path, payload: Any) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_story_content_source_lookup(
    storyline_index: dict[str, Any]
) -> dict[str, list[StoryContentSource]]:
    lookup: dict[str, list[StoryContentSource]] = {}
    sections = storyline_index.get("sections", {})
    if not isinstance(sections, dict):
        return lookup

    for section, entries in sections.items():
        if not isinstance(entries, list):
            continue

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            page = entry.get("page")
            if not isinstance(page, str) or not page:
                continue

            source = StoryContentSource(
                page=page,
                url=str(entry.get("sourceUrl") or build_story_page_url(page, base_url="https://prts.wiki/")),
                chapter_title=str(entry.get("chapterTitle") or entry.get("title") or page),
                section=str(section),
            )

            for key in build_source_keys(source):
                lookup.setdefault(key, []).append(source)

    return lookup


def resolve_chapter_content_source(
    chapter: dict[str, Any],
    sources: dict[str, list[StoryContentSource]],
    sections: set[str],
) -> StoryContentSource | None:
    candidates: list[StoryContentSource] = []
    for key in build_chapter_keys(chapter):
        candidates.extend(sources.get(key, []))

    if not candidates:
        return None

    section_match = [source for source in candidates if source.section in sections]
    return (section_match or candidates)[0]


def build_source_keys(source: StoryContentSource) -> set[str]:
    code, title, part = split_page(source.page)
    keys = set()
    if code and part:
        keys.add(build_match_key(code=code, title=title, part=part))
        keys.add(build_match_key(code=code, title="", part=part))
    if title and part:
        keys.add(build_match_key(code="", title=title, part=part))
    return keys


def build_chapter_keys(chapter: dict[str, Any]) -> set[str]:
    code = normalize_token(str(chapter.get("code") or ""))
    title = normalize_token(str(chapter.get("title") or ""))
    part = PART_BY_AVG_TAG.get(str(chapter.get("avgTag") or ""), "NBT")
    keys = set()
    if code:
        keys.add(build_match_key(code=code, title=title, part=part))
        keys.add(build_match_key(code=code, title="", part=part))
    if title:
        keys.add(build_match_key(code="", title=title, part=part))
    return keys


def split_page(page: str) -> tuple[str, str, str]:
    page_title, _, raw_part = page.partition("/")
    part = raw_part.upper() or "NBT"
    if "_" in page_title:
        raw_code, raw_title = page_title.split("_", 1)
        return normalize_token(raw_code), normalize_token(raw_title), part

    match = re.match(r"^(?P<code>[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\s+(?P<title>.+)$", page_title)
    if match:
        return normalize_token(match.group("code")), normalize_token(match.group("title")), part

    return "", normalize_token(page_title), part


def album_sections_for_album_kind(entry_type: str) -> set[str]:
    if entry_type == "mainline":
        return {"mainline"}
    if entry_type == "otherStory":
        return {"other", "cc"}
    if entry_type == "sideStory":
        return {"sideStory"}
    return {"sidestory", "sideStory"}


def build_match_key(*, code: str, title: str, part: str) -> str:
    return "|".join([normalize_token(code), normalize_token(title), part.upper()])


def normalize_token(value: str) -> str:
    return re.sub(r"\s+", "", value).strip().lower()
