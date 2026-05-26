from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Literal
from urllib.parse import quote, unquote, urljoin

from .client import WikiClient

StorylineSection = Literal["mainline", "sidestory", "sideStory", "cc", "other"]
SECTION_ORDER: tuple[StorylineSection, ...] = ("mainline", "sidestory", "sideStory", "cc", "other")
A_TAG_RE = re.compile(r"<a\b(?P<attrs>[^>]*)>(?P<text>.*?)</a>", re.IGNORECASE | re.DOTALL)
ATTR_RE = re.compile(r'([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("(?P<double>[^"]*)"|\'(?P<single>[^\']*)\')', re.DOTALL)
H_TAG_RE = re.compile(r"<h[1-6]\b[^>]*>(?P<heading>.*?)</h[1-6]>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
TR_TAG_RE = re.compile(r"<tr\b[^>]*>(?P<body>.*?)</tr>", re.IGNORECASE | re.DOTALL)
TH_TAG_RE = re.compile(r"<th\b[^>]*>(?P<body>.*?)</th>", re.IGNORECASE | re.DOTALL)
TD_TAG_RE = re.compile(r"<td\b[^>]*>(?P<body>.*?)</td>", re.IGNORECASE | re.DOTALL)
RENDERED_REVISION_RE = re.compile(r'"wgRevisionId"\s*:\s*(?P<oldid>\d+)')
GENERIC_OTHER_GROUP_TITLES = {"剧情"}
OTHER_CATEGORY_TITLES = {"剧情", "特殊", "集成战略", "生息演算", "四月辑录"}


@dataclass(frozen=True, slots=True)
class StorylineEntry:
    section: StorylineSection
    page: str
    title: str
    source_url: str
    group_title: str | None = None
    album_title: str | None = None
    chapter_title: str | None = None
    page_title: str | None = None

    def as_json(self) -> dict[str, str]:
        payload = {"title": self.title, "page": self.page, "sourceUrl": self.source_url}
        if self.group_title:
            payload["groupTitle"] = self.group_title
        if self.album_title:
            payload["albumTitle"] = self.album_title
        if self.chapter_title:
            payload["chapterTitle"] = self.chapter_title
        if self.page_title:
            payload["pageTitle"] = self.page_title
        return payload


def build_storyline_index(
    *,
    storyline_page: str,
    output_dir: Path,
    cache_dir: Path,
    rendered_fixture: Path | None = None,
    parse_fixture: Path | None = None,
    cargo_fixture: Path | None = None,
    dry_run: bool = False,
    client: WikiClient | None = None,
) -> dict[str, object]:
    wiki_client = client or WikiClient(cache_dir)
    attempts: list[str] = []
    failures: list[dict[str, str]] = []
    entries: list[StorylineEntry] = []
    source_method = "none"
    source_oldid: str | None = None

    try:
        rendered_html = load_rendered_html(rendered_fixture, wiki_client, storyline_page, dry_run=dry_run)
        attempts.append("rendered")
        source_oldid = extract_rendered_oldid(rendered_html)
        entries = parse_storyline_entries_from_rendered_html(rendered_html, base_url=wiki_client.base_url)
        if entries:
            source_method = "rendered"
    except Exception as error:
        failures.append({"source": "rendered", "message": str(error)})

    if not entries:
        try:
            parse_payload = load_parse_payload(parse_fixture, wiki_client, storyline_page, dry_run=dry_run)
            attempts.append("parse-api")
            source_oldid = extract_parse_oldid(parse_payload)
            parse_text = extract_parse_text(parse_payload)
            entries = parse_storyline_entries_from_rendered_html(parse_text, base_url=wiki_client.base_url)
            if entries:
                source_method = "parse-api"
        except Exception as error:
            failures.append({"source": "parse-api", "message": str(error)})

    if not entries:
        try:
            cargo_payload = load_cargo_payload(cargo_fixture, wiki_client, dry_run=dry_run)
            attempts.append("cargo")
            entries = parse_storyline_entries_from_cargo(cargo_payload, base_url=wiki_client.base_url)
            if entries:
                source_method = "cargo"
        except Exception as error:
            failures.append({"source": "cargo", "message": str(error)})

    index_payload = build_storyline_index_payload(entries, storyline_page, source_method, oldid=source_oldid)
    storyline_index_path = output_dir / "storyline" / "index.json"
    storyline_index_path.parent.mkdir(parents=True, exist_ok=True)
    storyline_index_path.write_text(json.dumps(index_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    section_counts = {
        section: len(index_payload["sections"][section])  # type: ignore[index]
        for section in SECTION_ORDER
    }
    report: dict[str, object] = {
        "storylinePage": storyline_page,
        "sourceMethod": source_method,
        "attempts": attempts,
        "entries": sum(section_counts.values()),
        "sectionCounts": section_counts,
        "oldid": source_oldid,
        "failures": failures,
    }
    diagnostics_path = cache_dir / "diagnostics" / "storyline-index-report.json"
    diagnostics_path.parent.mkdir(parents=True, exist_ok=True)
    diagnostics_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    return {"storylineIndexPath": str(storyline_index_path), "diagnosticsPath": str(diagnostics_path), "report": report}


def build_storyline_index_payload(entries: list[StorylineEntry], storyline_page: str, source_method: str, *, oldid: str | None = None) -> dict[str, object]:
    grouped: dict[StorylineSection, list[StorylineEntry]] = {section: [] for section in SECTION_ORDER}
    for entry in dedupe_and_sort_entries(entries):
        grouped[entry.section].append(entry)

    source: dict[str, str] = {"page": storyline_page, "method": source_method}
    if oldid:
        source["oldid"] = oldid

    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "sections": {section: [item.as_json() for item in grouped[section]] for section in SECTION_ORDER},
    }


def dedupe_and_sort_entries(entries: list[StorylineEntry]) -> list[StorylineEntry]:
    unique: dict[tuple[StorylineSection, str], StorylineEntry] = {}
    for entry in entries:
        key = (entry.section, entry.page)
        existing = unique.get(key)
        if existing is None or storyline_entry_metadata_rank(entry) > storyline_entry_metadata_rank(existing):
            unique[key] = entry

    return sorted(
        unique.values(),
        key=lambda item: (SECTION_ORDER.index(item.section), normalize_text(item.title).lower(), normalize_text(item.page).lower()),
    )


def storyline_entry_metadata_rank(entry: StorylineEntry) -> int:
    values = [entry.group_title, entry.album_title, entry.chapter_title, entry.page_title]
    return sum(1 for value in values if value)


def parse_storyline_entries_from_rendered_html(rendered_html: str, *, base_url: str = "https://prts.wiki/") -> list[StorylineEntry]:
    entries: list[StorylineEntry] = []
    heading_matches = list(H_TAG_RE.finditer(rendered_html))
    for index, match in enumerate(heading_matches):
        heading = normalize_text(strip_tags(match.group("heading")))
        section = classify_storyline_section(heading)
        if section is None:
            continue

        segment_start = match.end()
        segment_end = heading_matches[index + 1].start() if index + 1 < len(heading_matches) else len(rendered_html)
        segment = rendered_html[segment_start:segment_end]
        entries.extend(extract_storyline_links_from_segment(segment, section=section, base_url=base_url))

    entries.extend(parse_storyline_entries_from_table_rows(rendered_html, base_url=base_url))
    return dedupe_and_sort_entries(entries)


def parse_storyline_entries_from_table_rows(rendered_html: str, *, base_url: str = "https://prts.wiki/") -> list[StorylineEntry]:
    entries: list[StorylineEntry] = []
    current_section: StorylineSection | None = None
    current_other_group_title: str | None = None

    for row_match in TR_TAG_RE.finditer(rendered_html):
        row = row_match.group("body")
        header_texts = [normalize_text(strip_tags(match.group("body"))) for match in TH_TAG_RE.finditer(row)]
        joined_headers = " ".join(header_texts)
        data_segments = [match.group("body") for match in TD_TAG_RE.finditer(row)]
        row_has_links = any(A_TAG_RE.search(segment) for segment in data_segments)

        if "主线剧情一览" in joined_headers:
            current_section = "mainline"
            current_other_group_title = None
            continue
        if "活动剧情一览" in joined_headers:
            current_section = "other"
            current_other_group_title = None
            continue

        row_section = classify_storyline_table_row_section(joined_headers, current_section)
        if row_section is None:
            continue

        if should_promote_activity_story_row_to_story_set(
            header_texts,
            row_section=row_section,
            current_other_group_title=current_other_group_title,
            row_has_links=row_has_links,
        ):
            row_section = "sideStory"

        if row_section != "other":
            current_other_group_title = None
        else:
            leading_category = extract_leading_other_category_header(header_texts)
            if leading_category:
                current_other_group_title = leading_category

        metadata = resolve_table_row_storyline_metadata(
            header_texts,
            row_section=row_section,
            current_other_group_title=current_other_group_title,
            row_has_links=row_has_links,
        )

        if row_section == "other" and header_texts and not row_has_links:
            current_other_group_title = header_texts[-1]
            continue

        for segment in data_segments:
            entries.extend(
                extract_storyline_links_from_segment(
                    segment,
                    section=row_section,
                    base_url=base_url,
                    group_title=metadata["group_title"],
                    album_title=metadata["album_title"],
                )
            )

    return entries


def resolve_table_row_storyline_metadata(
    header_texts: list[str],
    *,
    row_section: StorylineSection,
    current_other_group_title: str | None,
    row_has_links: bool,
) -> dict[str, str | None]:
    if row_section == "sideStory" and row_has_links:
        normalized_headers = [header for header in header_texts if header]
        leading_header = normalized_headers[0] if normalized_headers else None
        row_header = normalized_headers[-1] if normalized_headers else None
        if leading_header and row_header in GENERIC_OTHER_GROUP_TITLES:
            return {"group_title": None, "album_title": leading_header}
        return {"group_title": None, "album_title": None}

    if row_section != "other" or not row_has_links:
        return {"group_title": None, "album_title": None}

    normalized_headers = [header for header in header_texts if header]
    row_header = normalized_headers[-1] if normalized_headers else None
    leading_header = normalized_headers[0] if normalized_headers else None

    if len(normalized_headers) >= 2 and row_header:
        if leading_header in OTHER_CATEGORY_TITLES:
            return {
                "group_title": leading_header,
                "album_title": None if row_header in GENERIC_OTHER_GROUP_TITLES else row_header,
            }

        if row_header in GENERIC_OTHER_GROUP_TITLES and leading_header and leading_header not in OTHER_CATEGORY_TITLES:
            return {"group_title": row_header, "album_title": leading_header}

    if current_other_group_title and row_header and row_header != current_other_group_title:
        if row_header in GENERIC_OTHER_GROUP_TITLES:
            return {"group_title": row_header, "album_title": None}
        return {"group_title": current_other_group_title, "album_title": row_header}

    if row_header:
        if row_header in GENERIC_OTHER_GROUP_TITLES:
            return {"group_title": row_header, "album_title": None}
        return {"group_title": current_other_group_title, "album_title": row_header}

    return {"group_title": current_other_group_title, "album_title": None}


def should_promote_activity_story_row_to_story_set(
    header_texts: list[str],
    *,
    row_section: StorylineSection,
    current_other_group_title: str | None,
    row_has_links: bool,
) -> bool:
    if row_section != "other" or not row_has_links:
        return False

    normalized_headers = [header for header in header_texts if header]
    if len(normalized_headers) < 2:
        return False

    leading_header = normalized_headers[0]
    row_header = normalized_headers[-1]
    if row_header not in GENERIC_OTHER_GROUP_TITLES:
        return False
    if leading_header in OTHER_CATEGORY_TITLES:
        return False
    return True


def extract_leading_other_category_header(header_texts: list[str]) -> str | None:
    for header in header_texts:
        if header in OTHER_CATEGORY_TITLES:
            return header
    return None


def parse_storyline_entries_from_cargo(payload: dict[str, object], *, base_url: str = "https://prts.wiki/") -> list[StorylineEntry]:
    rows = payload.get("cargoquery")
    if not isinstance(rows, list):
        return []

    entries: list[StorylineEntry] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        field_map = row.get("title")
        if not isinstance(field_map, dict):
            field_map = row

        page = first_non_empty(
            field_map.get("page"),
            field_map.get("页面"),
            field_map.get("storyPage"),
            field_map.get("entryPage"),
        )
        if not page:
            continue

        section_hint = first_non_empty(
            field_map.get("category"),
            field_map.get("分类"),
            field_map.get("section"),
            field_map.get("storySetType"),
        )
        section = classify_storyline_section(section_hint or "")
        if section is None:
            continue

        title = first_non_empty(field_map.get("title"), field_map.get("name"), field_map.get("名称"), page) or page
        entries.append(
            StorylineEntry(
                section=section,
                page=page,
                title=title,
                source_url=build_story_page_url(page, base_url=base_url),
                chapter_title=title,
            )
        )

    return entries


def extract_storyline_links_from_segment(
    segment: str,
    *,
    section: StorylineSection,
    base_url: str,
    group_title: str | None = None,
    album_title: str | None = None,
) -> list[StorylineEntry]:
    entries: list[StorylineEntry] = []
    for match in A_TAG_RE.finditer(segment):
        attrs = parse_tag_attributes(match.group("attrs"))
        href = attrs.get("href")
        if not href:
            continue

        page = extract_page_from_href(href, base_url=base_url)
        if not page:
            continue

        chapter_title = normalize_text(strip_tags(match.group("text"))) or None
        page_title = attrs.get("title") or None
        resolved_album_title = album_title or (
            chapter_title if section == "other" and should_use_link_text_as_archive_album(group_title) else None
        )
        title = page_title or chapter_title or page
        entries.append(
            StorylineEntry(
                section=section,
                page=page,
                title=title,
                source_url=build_story_page_url(page, base_url=base_url),
                group_title=group_title,
                album_title=resolved_album_title,
                chapter_title=chapter_title,
                page_title=page_title,
            )
        )

    return entries


def should_use_link_text_as_archive_album(group_title: str | None) -> bool:
    return group_title in GENERIC_OTHER_GROUP_TITLES or group_title == "特殊"


def parse_tag_attributes(attrs_text: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for match in ATTR_RE.finditer(attrs_text):
        key = match.group(1).lower()
        value = match.group("double") or match.group("single") or ""
        parsed[key] = unescape(value).strip()
    return parsed


def load_rendered_html(
    fixture: Path | None,
    client: WikiClient,
    storyline_page: str,
    *,
    dry_run: bool,
) -> str:
    if fixture is not None:
        return fixture.read_text(encoding="utf-8")
    if dry_run:
        raise RuntimeError("No rendered fixture provided in dry-run mode")
    return client.fetch_rendered_page(storyline_page)


def load_parse_payload(
    fixture: Path | None,
    client: WikiClient,
    storyline_page: str,
    *,
    dry_run: bool,
) -> dict[str, object]:
    if fixture is not None:
        payload = json.loads(fixture.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Parse fixture payload must be an object")
        return payload
    if dry_run:
        raise RuntimeError("No parse fixture provided in dry-run mode")
    return client.fetch_parse_api(storyline_page)


def load_cargo_payload(
    fixture: Path | None,
    client: WikiClient,
    *,
    dry_run: bool,
) -> dict[str, object]:
    if fixture is not None:
        payload = json.loads(fixture.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Cargo fixture payload must be an object")
        return payload
    if dry_run:
        raise RuntimeError("No cargo fixture provided in dry-run mode")
    return client.cargo_query(
        tables="剧情一览",
        fields="name=title,page,category",
        limit="800",
    )


def extract_parse_text(payload: dict[str, object]) -> str:
    parse_obj = payload.get("parse")
    if not isinstance(parse_obj, dict):
        raise ValueError("Parse API payload missing parse object")

    text_obj = parse_obj.get("text")
    if isinstance(text_obj, str):
        return text_obj
    if isinstance(text_obj, dict):
        candidate = text_obj.get("*")
        if isinstance(candidate, str):
            return candidate
    raise ValueError("Parse API payload missing text html")


def extract_rendered_oldid(rendered_html: str) -> str | None:
    match = RENDERED_REVISION_RE.search(rendered_html)
    if match:
        return match.group("oldid")
    return None


def extract_parse_oldid(payload: dict[str, object]) -> str | None:
    parse_obj = payload.get("parse")
    if not isinstance(parse_obj, dict):
        return None
    revid = parse_obj.get("revid")
    if isinstance(revid, int):
        return str(revid)
    if isinstance(revid, str) and revid.strip():
        return revid.strip()
    return None


def classify_storyline_section(label: str) -> StorylineSection | None:
    normalized = normalize_text(label).lower()
    if not normalized:
        return None

    if "主题曲" in normalized or "mainline" in normalized or "主线" in normalized:
        return "mainline"
    if "别传" in normalized or "sidestory" in normalized or "intermezzi" in normalized or normalized == "ss":
        return "sidestory"
    if "故事集" in normalized or "storyset" in normalized or "collect" in normalized:
        return "sideStory"
    if "危机合约" in normalized or normalized == "cc":
        return "cc"
    if normalized == "none":
        return "cc"
    if normalized in {"其他", "other"}:
        return "other"
    return None


def classify_storyline_table_row_section(label: str, current_section: StorylineSection | None) -> StorylineSection | None:
    normalized = normalize_text(label).lower()
    if not normalized:
        return current_section

    if "主线剧情一览" in normalized:
        return "mainline"
    if "支线" in normalized:
        return "sidestory"
    if "剧情" in normalized and "主线剧情一览" not in normalized and "活动剧情一览" not in normalized:
        return current_section or "other"
    if "危机合约" in normalized:
        return "other" if current_section == "other" else "cc"

    explicit_section = classify_storyline_section(label)
    if explicit_section is not None:
        return explicit_section
    if current_section == "other":
        return "other"
    return current_section


def extract_page_from_href(href: str, *, base_url: str) -> str | None:
    cleaned = unescape(href).strip()
    if not cleaned or cleaned.startswith("#"):
        return None

    if cleaned.startswith("./"):
        page = cleaned[2:]
    elif cleaned.startswith("/w/"):
        page = cleaned[3:]
    elif cleaned.startswith(base_url):
        marker = "w/"
        marker_index = cleaned.find(marker)
        if marker_index < 0:
            return None
        page = cleaned[marker_index + len(marker) :]
    else:
        return None

    page = unquote(page.split("?", 1)[0].split("#", 1)[0]).strip("/")
    if not page:
        return None
    if page.lower().startswith(("file:", "image:", "文件:", "图像:")):
        return None
    return page


def build_story_page_url(page: str, *, base_url: str) -> str:
    return urljoin(base_url, "w/" + quote(page, safe="/"))


def strip_tags(html_fragment: str) -> str:
    return TAG_RE.sub("", html_fragment)


def normalize_text(value: str) -> str:
    return " ".join(unescape(value).replace("\u00a0", " ").split())


def first_non_empty(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str):
            normalized = normalize_text(value)
            if normalized:
                return normalized
    return None
