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


@dataclass(frozen=True, slots=True)
class OperatorIndexEntry:
    name: str
    slug: str
    page: str
    profession: str | None = None
    rarity: str | None = None
    faction: str | None = None

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
        return payload


def build_operator_index(
    *,
    operator_index_page: str,
    output_dir: Path,
    cache_dir: Path,
    rendered_fixture: Path | None = None,
    parse_fixture: Path | None = None,
    cargo_fixture: Path | None = None,
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
