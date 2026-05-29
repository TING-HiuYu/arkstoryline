from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import CONFIG
from .content_sources import sync_story_content_sources
from .operator import build_operator_index
from .storyline_index import build_storyline_index
from .terra_historicus import sync_terra_historicus_index


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m scripts.resourcesFetcher")
    subparsers = parser.add_subparsers(dest="command", required=True)

    storyline_parser = subparsers.add_parser(
        "sync-storyline-index",
        help="Discover storyline entries from 剧情一览 and build public/data/storyline/index.json",
    )
    storyline_parser.add_argument("--storyline-page", default=CONFIG.storyline_page)
    storyline_parser.add_argument("--storyline-rendered-fixture")
    storyline_parser.add_argument("--storyline-parse-fixture")
    storyline_parser.add_argument("--storyline-cargo-fixture")
    storyline_parser.add_argument("--output-dir", default=CONFIG.data_dir)
    storyline_parser.add_argument("--cache-dir", default=CONFIG.cache_dir)
    storyline_parser.add_argument("--dry-run", action="store_true")

    content_sources_parser = subparsers.add_parser(
        "sync-story-content-sources",
        help="Attach PRTS runtime story page URLs to generated album and chapter JSON files",
    )
    content_sources_parser.add_argument("--storyline-index", default=CONFIG.storyline_index)
    content_sources_parser.add_argument("--output-dir", default=CONFIG.data_dir)
    content_sources_parser.add_argument("--locale", default=CONFIG.locale)
    content_sources_parser.add_argument("--dry-run", action="store_true")

    operator_index_parser = subparsers.add_parser(
        "sync-operator-index",
        help="Discover operators from 干员一览 and build public/data/operator/index.json",
    )
    operator_index_parser.add_argument("--operator-index-page", default=CONFIG.operator_index_page)
    operator_index_parser.add_argument("--operator-rendered-fixture")
    operator_index_parser.add_argument("--operator-parse-fixture")
    operator_index_parser.add_argument("--operator-cargo-fixture")
    operator_index_parser.add_argument("--output-dir", default=CONFIG.data_dir)
    operator_index_parser.add_argument("--cache-dir", default=CONFIG.cache_dir)
    operator_index_parser.add_argument(
        "--operator-limit",
        type=int,
        help="Limit processed operators for parser verification runs.",
    )
    operator_index_parser.add_argument(
        "--skip-export-manifest",
        action="store_true",
        help="Only refresh the operator list; do not inspect each operator page for downloadable entries.",
    )
    operator_index_parser.add_argument("--dry-run", action="store_true")

    terra_historicus_parser = subparsers.add_parser(
        "sync-terra-historicus-index",
        help="Fetch 泰拉记事社 comic list and build public/data/terra-historicus/index.json",
    )
    terra_historicus_parser.add_argument("--url", default=CONFIG.terra_historicus_url)
    terra_historicus_parser.add_argument("--rendered-fixture")
    terra_historicus_parser.add_argument("--output-dir", default=CONFIG.data_dir)
    terra_historicus_parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if args.command == "sync-storyline-index":
        result = build_storyline_index(
            storyline_page=args.storyline_page,
            output_dir=Path(args.output_dir),
            cache_dir=Path(args.cache_dir),
            rendered_fixture=Path(args.storyline_rendered_fixture) if args.storyline_rendered_fixture else None,
            parse_fixture=Path(args.storyline_parse_fixture) if args.storyline_parse_fixture else None,
            cargo_fixture=Path(args.storyline_cargo_fixture) if args.storyline_cargo_fixture else None,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return

    if args.command == "sync-story-content-sources":
        result = sync_story_content_sources(
            storyline_index_path=Path(args.storyline_index),
            output_dir=Path(args.output_dir),
            locale=args.locale,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return

    if args.command == "sync-operator-index":
        result = build_operator_index(
            operator_index_page=args.operator_index_page,
            output_dir=Path(args.output_dir),
            cache_dir=Path(args.cache_dir),
            rendered_fixture=Path(args.operator_rendered_fixture) if args.operator_rendered_fixture else None,
            parse_fixture=Path(args.operator_parse_fixture) if args.operator_parse_fixture else None,
            cargo_fixture=Path(args.operator_cargo_fixture) if args.operator_cargo_fixture else None,
            include_export_manifest=not args.skip_export_manifest,
            operator_limit=args.operator_limit,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return

    if args.command == "sync-terra-historicus-index":
        result = sync_terra_historicus_index(
            output_dir=Path(args.output_dir),
            url=args.url,
            rendered_fixture=Path(args.rendered_fixture) if args.rendered_fixture else None,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return


if __name__ == "__main__":
    main()
