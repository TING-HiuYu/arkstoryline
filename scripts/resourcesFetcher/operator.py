from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from .client import WikiClient
from .models import ResourceDiagnostics

HTML_LINK_RE = re.compile(r"<a\b(?P<attrs>[^>]*)>(?P<label>.*?)</a>", re.IGNORECASE | re.DOTALL)
HTML_ROW_RE = re.compile(r"<tr\b(?P<attrs>[^>]*)>(?P<body>.*?)</tr>", re.IGNORECASE | re.DOTALL)
HTML_DIV_OPEN_RE = re.compile(r"<div\b(?P<attrs>[^>]*)>", re.IGNORECASE | re.DOTALL)
HTML_TAG_RE = re.compile(r"<[^>]+>")
HTML_ATTR_RE = re.compile(r"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
RENDERED_REVISION_RE = re.compile(r'"wgRevisionId"\s*:\s*(?P<oldid>\d+)')
HTML_HEADING_RE = re.compile(
    r"<h(?P<level>[23])\b(?P<attrs>[^>]*)>(?P<body>.*?)</h(?P=level)>",
    re.IGNORECASE | re.DOTALL,
)
HTML_BOLD_RE = re.compile(r"<b\b[^>]*>(?P<label>.*?)</b>", re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True, slots=True)
class OperatorIndexEntry:
    name: str
    slug: str
    page: str
    profession: str | None = None
    rarity: str | None = None
    faction: str | None = None
    export_manifest: dict[str, list[dict[str, object]]] | None = None

    def as_json(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "name": self.name,
            "slug": self.slug,
            "page": self.page,
        }
        if self.profession:
            payload["profession"] = self.profession
        if self.rarity:
            payload["rarity"] = self.rarity
        if self.faction:
            payload["faction"] = self.faction
        if self.export_manifest:
            payload["exportManifest"] = self.export_manifest
        return payload


def build_operator_index(
    *,
    operator_index_page: str,
    output_dir: Path,
    cache_dir: Path,
    rendered_fixture: Path | None = None,
    parse_fixture: Path | None = None,
    cargo_fixture: Path | None = None,
    include_export_manifest: bool = True,
    operator_limit: int | None = None,
    dry_run: bool = False,
) -> dict[str, object]:
    diagnostics = ResourceDiagnostics()
    client = WikiClient(cache_dir)
    attempts: list[str] = []
    failures: list[dict[str, str]] = []
    method = "none"
    oldid: str | None = None
    entries: list[OperatorIndexEntry] = []

    if rendered_fixture:
        try:
            attempts.append("rendered-fixture")
            rendered_html = rendered_fixture.read_text(encoding="utf-8")
            oldid = extract_rendered_oldid(rendered_html)
            entries = parse_operator_entries_from_rendered_html(rendered_html)
            method = "rendered-fixture" if entries else method
        except Exception as error:
            failures.append({"source": "rendered-fixture", "message": str(error)})

    if not entries and parse_fixture:
        try:
            attempts.append("parse-fixture")
            payload = json.loads(parse_fixture.read_text(encoding="utf-8"))
            oldid = extract_parse_oldid(payload)
            entries = parse_operator_entries_from_parse_api(payload)
            method = "parse-fixture" if entries else method
        except Exception as error:
            failures.append({"source": "parse-fixture", "message": str(error)})

    if not entries and cargo_fixture:
        try:
            attempts.append("cargo-fixture")
            payload = json.loads(cargo_fixture.read_text(encoding="utf-8"))
            entries = parse_operator_entries_from_cargo(payload)
            method = "cargo-fixture" if entries else method
        except Exception as error:
            failures.append({"source": "cargo-fixture", "message": str(error)})

    if not entries and not dry_run and not (rendered_fixture or parse_fixture or cargo_fixture):
        for source_name, loader in (
            ("rendered", lambda: parse_rendered_operator_index(client, operator_index_page)),
            ("parse-api", lambda: parse_api_operator_index(client, operator_index_page)),
            ("cargo", lambda: (parse_operator_entries_from_cargo(fetch_operator_cargo(client)), None)),
        ):
            try:
                attempts.append(source_name)
                entries, oldid = loader()
                if entries:
                    method = source_name
                    break
            except Exception as error:
                failures.append({"source": source_name, "message": str(error)})

    if dry_run and not (rendered_fixture or parse_fixture or cargo_fixture):
        diagnostics.disabled_sources.append(operator_index_page)

    if not entries:
        diagnostics.missing_pages.append(operator_index_page)

    if operator_limit is not None:
        entries = entries[: max(0, operator_limit)]

    manifest_failures: list[dict[str, str]] = []
    if entries and include_export_manifest and not dry_run:
        entries, manifest_failures = attach_operator_export_manifests(client, entries)

    source: dict[str, object] = {"providerId": "arknights-wiki", "page": operator_index_page, "method": method}
    if oldid:
        source["oldid"] = oldid

    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "operators": [entry.as_json() for entry in entries],
    }
    index_path = output_dir / "operator" / "index.json"
    write_json(index_path, payload)

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "operatorCount": len(entries),
        "source": source,
        "sourceMethod": method,
        "attempts": attempts,
        "oldid": oldid,
        "failures": failures,
        "manifestFailures": manifest_failures,
        "diagnostics": diagnostics.as_json({"ready": 0, "referenced": 0, "missing": 0, "disabled": 0}),
    }
    diagnostics_path = cache_dir / "diagnostics" / "operator-index-report.json"
    write_json(diagnostics_path, report)

    return {"operatorIndexPath": str(index_path), "diagnosticsPath": str(diagnostics_path), "report": report}


def parse_rendered_operator_index(client: WikiClient, operator_index_page: str) -> tuple[list[OperatorIndexEntry], str | None]:
    rendered_html = client.fetch_rendered_page(operator_index_page)
    return parse_operator_entries_from_rendered_html(rendered_html), extract_rendered_oldid(rendered_html)


def parse_api_operator_index(client: WikiClient, operator_index_page: str) -> tuple[list[OperatorIndexEntry], str | None]:
    payload = client.fetch_parse_api(operator_index_page)
    return parse_operator_entries_from_parse_api(payload), extract_parse_oldid(payload)


def attach_operator_export_manifests(
    client: WikiClient, entries: list[OperatorIndexEntry]
) -> tuple[list[OperatorIndexEntry], list[dict[str, str]]]:
    failures: list[dict[str, str]] = []
    hydrated_entries: list[OperatorIndexEntry] = []

    try:
        from rich.progress import Progress
    except Exception:
        Progress = None  # type: ignore[assignment]

    if Progress is None:
        iterator = entries
        task_context = None
    else:
        task_context = Progress()
        task_context.start()
        task_id = task_context.add_task("Fetching operator export manifests", total=len(entries))
        iterator = entries

    try:
        for index, entry in enumerate(iterator, start=1):
            export_manifest: dict[str, list[dict[str, object]]] | None = None
            try:
                payload = client.fetch_parse_api(entry.page)
                html = extract_parse_html(payload)
                export_manifest = parse_operator_export_manifest_html(
                    html=html,
                    operator_slug=entry.slug,
                    operator_page=entry.page,
                )
            except Exception as error:
                failures.append({"operator": entry.name, "page": entry.page, "message": str(error)})

            hydrated_entries.append(
                OperatorIndexEntry(
                    name=entry.name,
                    slug=entry.slug,
                    page=entry.page,
                    profession=entry.profession,
                    rarity=entry.rarity,
                    faction=entry.faction,
                    export_manifest=export_manifest,
                )
            )

            if task_context is not None:
                task_context.update(
                    task_id,
                    description=f"Fetching operator export manifests: {index}/{len(entries)} {entry.name}",
                )
                task_context.advance(task_id)
            elif index == 1 or index == len(entries) or index % 25 == 0:
                print(f"operator manifest {index}/{len(entries)}: {entry.name}", flush=True)
    finally:
        if task_context is not None:
            task_context.stop()

    return hydrated_entries, failures


def extract_parse_html(payload: dict[str, Any]) -> str:
    parse_payload = payload.get("parse")
    if not isinstance(parse_payload, dict):
        return ""
    text_payload = parse_payload.get("text")
    if isinstance(text_payload, str):
        return text_payload
    if isinstance(text_payload, dict):
        html = text_payload.get("*")
        return html if isinstance(html, str) else ""
    return ""


def parse_operator_export_manifest_html(
    *, html: str, operator_slug: str, operator_page: str
) -> dict[str, list[dict[str, object]]]:
    archive_entries: list[dict[str, object]] = []
    module_entries: list[dict[str, object]] = []
    confidential_entries: list[dict[str, object]] = []

    if get_heading_section_html(html, "干员档案"):
        archive_entries.append(
            {
                "id": f"{operator_slug}:archive",
                "kind": "archive",
                "title": "档案",
                "page": operator_page,
                "sourceUrl": build_wiki_source_url(operator_page),
                "sections": ["基础档案", "综合体检测试", "综合性能检测结果", "临床诊断分析"],
            }
        )

    for index, title in parse_operator_exportable_module_titles(html):
        module_entries.append(
            {
                "id": f"{operator_slug}:module:{operator_slug}:module:{index}",
                "kind": "module",
                "title": title,
                "page": operator_page,
                "sourceUrl": build_wiki_source_url(operator_page),
                "sections": ["基础信息"],
            }
        )

    for index, item in enumerate(parse_operator_confidential_links(html), start=1):
        confidential_entries.append(
            {
                "id": f"{operator_slug}:confidential:{operator_slug}:confidential:{index}",
                "kind": "confidential",
                "title": item["title"],
                "page": item["page"],
                "sourceUrl": build_wiki_source_url(item["page"]),
            }
        )

    return {
        "archive": archive_entries,
        "modules": module_entries,
        "confidential": confidential_entries,
    }


def parse_operator_entries_from_rendered_html(html: str) -> list[OperatorIndexEntry]:
    data_entries = parse_operator_entries_from_filter_data(html)
    if data_entries:
        return data_entries

    entries: dict[str, OperatorIndexEntry] = {}
    for row_match in HTML_ROW_RE.finditer(html):
        entry = entry_from_html_fragment(row_match.group("body"), parse_html_attrs(row_match.group("attrs")))
        if entry:
            entries.setdefault(entry.slug, entry)

    if entries:
        return sorted(entries.values(), key=lambda item: item.slug)

    for link_match in HTML_LINK_RE.finditer(html):
        attrs = parse_html_attrs(link_match.group("attrs"))
        page = page_from_href(attrs.get("href", ""))
        label = clean_html_text(link_match.group("label"))
        if not page or not label or looks_non_operator_page(page):
            continue
        entry = OperatorIndexEntry(name=label, slug=build_operator_slug(label), page=page)
        entries.setdefault(entry.slug, entry)

    return sorted(entries.values(), key=lambda item: item.slug)


def parse_operator_entries_from_filter_data(html: str) -> list[OperatorIndexEntry]:
    entries: dict[str, OperatorIndexEntry] = {}
    for div_match in HTML_DIV_OPEN_RE.finditer(html):
        attrs = parse_html_attrs(div_match.group("attrs"))
        name = attrs.get("data-zh")
        if not name:
            continue
        entry = OperatorIndexEntry(
            name=name,
            slug=build_operator_slug(name),
            page=name,
            profession=attrs.get("data-profession"),
            rarity=attrs.get("data-rarity"),
            faction=attrs.get("data-logo") or attrs.get("data-nation") or attrs.get("data-group"),
        )
        entries.setdefault(entry.slug, entry)

    return sorted(entries.values(), key=lambda item: item.slug)


def parse_operator_entries_from_parse_api(payload: dict[str, Any]) -> list[OperatorIndexEntry]:
    parse_payload = payload.get("parse")
    if not isinstance(parse_payload, dict):
        return []
    text_payload = parse_payload.get("text")
    if isinstance(text_payload, str):
        return parse_operator_entries_from_rendered_html(text_payload)
    if isinstance(text_payload, dict):
        html = text_payload.get("*")
        if isinstance(html, str):
            return parse_operator_entries_from_rendered_html(html)
    return []


def parse_operator_entries_from_cargo(payload: dict[str, Any]) -> list[OperatorIndexEntry]:
    cargoquery = payload.get("cargoquery")
    if not isinstance(cargoquery, list):
        return []

    entries: list[OperatorIndexEntry] = []
    seen: set[str] = set()
    for item in cargoquery:
        title = item.get("title") if isinstance(item, dict) else None
        if not isinstance(title, dict):
            continue
        name = pick_first(title, "干员名", "name", "Name", "charName", "title", "页面", "page")
        page = pick_first(title, "页面", "page", "Page", "_pageName") or name
        if not name or not page:
            continue
        slug = build_operator_slug(name)
        if slug in seen:
            continue
        seen.add(slug)
        entries.append(
            OperatorIndexEntry(
                name=name,
                slug=slug,
                page=page,
                profession=pick_first(title, "职业", "profession", "Profession"),
                rarity=pick_first(title, "稀有度", "星级", "rarity", "Rarity"),
                faction=pick_first(title, "阵营", "势力", "faction", "Faction"),
            )
        )

    return sorted(entries, key=lambda item: item.slug)


def parse_operator_exportable_module_titles(html: str) -> list[tuple[int, str]]:
    module_section = get_heading_section_html(html, "模组")
    module_sections = split_child_heading_sections(module_section, "3")
    titles: list[tuple[int, str]] = []
    seen: set[str] = set()

    for index, (title, body) in enumerate(module_sections, start=1):
        if not title or title in seen:
            continue
        if not extract_module_basic_info_text(body):
            continue
        seen.add(title)
        titles.append((index, title))

    return titles


def split_child_heading_sections(html: str, heading_level: str) -> list[tuple[str, str]]:
    headings = [match for match in HTML_HEADING_RE.finditer(html) if match.group("level") == heading_level]
    sections: list[tuple[str, str]] = []

    for index, heading in enumerate(headings):
        title = clean_heading_title(heading.group("body"))
        section_start = heading.end()
        section_end = headings[index + 1].start() if index + 1 < len(headings) else len(html)
        sections.append((title, html[section_start:section_end]))

    return sections


def extract_module_basic_info_text(html: str) -> str:
    text = clean_html_text(html.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n"))
    match = re.search(
        r"基础信息\s*(?:全文阅读\s*)?([\s\S]*?)(?=(?:攻击\s*[+＋]|生命\s*[+＋]|防御\s*[+＋]|法术抗性\s*[+＋]|模组解锁任务|解锁需求与材料消耗|任务\d|$))",
        text,
    )

    return re.sub(r"\s+", " ", match.group(1)).strip() if match else ""


def clean_heading_title(html: str) -> str:
    cleaned = re.sub(
        r"<span\b(?=[^>]*class=['\"][^'\"]*\bmw-editsection\b)[^>]*>.*?</span>",
        "",
        html,
        flags=re.I | re.S,
    )
    return re.sub(r"(?:\[?编辑\]?)$", "", clean_html_text(cleaned)).strip()


def parse_operator_confidential_links(html: str) -> list[dict[str, str]]:
    confidential_section = get_heading_section_html(html, "干员密录")
    records: list[dict[str, str]] = []
    seen_pages: set[str] = set()

    for row_match in HTML_ROW_RE.finditer(confidential_section):
        row = row_match.group("body")
        link_match = next(
            (
                match
                for match in HTML_LINK_RE.finditer(row)
                if (page_from_href(parse_html_attrs(match.group("attrs")).get("href", "")) or "").find(
                    "/干员密录/"
                )
                >= 0
            ),
            None,
        )
        if not link_match:
            continue
        attrs = parse_html_attrs(link_match.group("attrs"))
        page = page_from_href(attrs.get("href", ""))
        if not page or page in seen_pages:
            continue

        labels = [
            clean_html_text(match.group("label"))
            for match in HTML_BOLD_RE.finditer(row)
            if clean_html_text(match.group("label"))
        ]
        title = next(
            (
                label
                for label in reversed(labels)
                if not re.match(r"^Lv\.", label, re.IGNORECASE) and not label.endswith("%")
            ),
            "",
        )
        if not title:
            title = clean_html_text(link_match.group("label")) or f"干员密录 {len(records) + 1}"

        seen_pages.add(page)
        records.append({"title": title, "page": page})

    if records:
        return records

    for link_match in HTML_LINK_RE.finditer(confidential_section):
        attrs = parse_html_attrs(link_match.group("attrs"))
        page = page_from_href(attrs.get("href", ""))
        if not page or "/干员密录/" not in page or page in seen_pages:
            continue
        title = clean_html_text(link_match.group("label")) or f"干员密录 {len(records) + 1}"
        seen_pages.add(page)
        records.append({"title": title, "page": page})

    return records


def get_heading_section_html(html: str, heading_id: str) -> str:
    headings = list(HTML_HEADING_RE.finditer(html))

    for index, heading in enumerate(headings):
        if heading.group("level") != "2":
            continue

        attrs = parse_html_attrs(heading.group("attrs"))
        body = heading.group("body")
        body_attrs: dict[str, str] = {}
        for tag_match in HTML_TAG_RE.finditer(body):
            body_attrs.update(parse_html_attrs(tag_match.group(0)))

        heading_text = clean_html_text(body)
        if attrs.get("id") != heading_id and body_attrs.get("id") != heading_id and heading_text != heading_id:
            continue

        section_start = heading.end()
        section_end = len(html)
        for next_heading in headings[index + 1 :]:
            if next_heading.group("level") == "2":
                section_end = next_heading.start()
                break
        return html[section_start:section_end]

    return ""


def load_operator_index_entries(path: Path) -> list[OperatorIndexEntry]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    operators = payload.get("operators") if isinstance(payload, dict) else None
    if not isinstance(operators, list):
        raise ValueError(f"Operator index missing operators array: {path}")

    entries: list[OperatorIndexEntry] = []
    for item in operators:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        page = item.get("page")
        if not isinstance(name, str) or not name.strip() or not isinstance(page, str) or not page.strip():
            continue
        slug = item.get("slug")
        profession = item.get("profession")
        rarity = item.get("rarity")
        faction = item.get("faction")
        entries.append(
            OperatorIndexEntry(
                name=name.strip(),
                slug=slug.strip() if isinstance(slug, str) and slug.strip() else build_operator_slug(name),
                page=page.strip(),
                profession=profession.strip() if isinstance(profession, str) and profession.strip() else None,
                rarity=rarity.strip() if isinstance(rarity, str) and rarity.strip() else None,
                faction=faction.strip() if isinstance(faction, str) and faction.strip() else None,
            )
        )
    return entries


def extract_parse_oldid(payload: dict[str, Any]) -> str | None:
    parse_payload = payload.get("parse")
    if not isinstance(parse_payload, dict):
        return None
    revid = parse_payload.get("revid")
    if isinstance(revid, int):
        return str(revid)
    if isinstance(revid, str) and revid.strip():
        return revid.strip()
    return None


def extract_rendered_oldid(html: str) -> str | None:
    match = RENDERED_REVISION_RE.search(html)
    return match.group("oldid") if match else None


def build_operator_slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).strip()
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:10]
    return f"operator-{digest}"


def entry_from_html_fragment(fragment: str, row_attrs: dict[str, str]) -> OperatorIndexEntry | None:
    link_match = HTML_LINK_RE.search(fragment)
    if not link_match:
        return None
    attrs = {**row_attrs, **parse_html_attrs(link_match.group("attrs"))}
    page = page_from_href(attrs.get("href", ""))
    name = clean_html_text(attrs.get("data-name", "")) or clean_html_text(link_match.group("label"))
    if not page or not name:
        return None
    return OperatorIndexEntry(
        name=name,
        slug=build_operator_slug(name),
        page=page,
        profession=attrs.get("data-profession") or attrs.get("data-career"),
        rarity=attrs.get("data-rarity"),
        faction=attrs.get("data-logo") or attrs.get("data-nation") or attrs.get("data-group"),
    )


def parse_html_attrs(attrs: str) -> dict[str, str]:
    return {match.group(1).lower(): match.group(3) for match in HTML_ATTR_RE.finditer(attrs)}


def clean_html_text(value: str) -> str:
    text = HTML_TAG_RE.sub("", value)
    text = text.replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def page_from_href(href: str) -> str | None:
    if not href:
        return None
    if href.startswith("/w/"):
        return unquote(href[len("/w/") :]).split("#", 1)[0]
    if "/w/" in href:
        return unquote(href.split("/w/", 1)[1]).split("#", 1)[0]
    return None


def looks_non_operator_page(page: str) -> bool:
    return any(marker in page for marker in ("关卡一览", "剧情一览", "采购中心", "公开招募", "首页"))


def fetch_operator_cargo(client: WikiClient) -> dict[str, Any]:
    return client.cargo_query(tables="干员", fields="干员名,页面,职业,稀有度,阵营", limit="max")


def pick_first(mapping: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_wiki_source_url(page: str) -> str:
    return "https://prts.wiki/w/" + "/".join(
        segment for segment in (quote_path_segment(part) for part in page.split("/")) if segment
    )


def quote_path_segment(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="")
