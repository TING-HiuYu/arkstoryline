from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.resourcesFetcher.operator import (
    build_operator_index,
    parse_operator_export_manifest_html,
    parse_operator_entries_from_cargo,
    parse_operator_entries_from_parse_api,
    parse_operator_entries_from_rendered_html,
)


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"


class OperatorIndexTests(unittest.TestCase):
    def test_operator_index_discovery_from_rendered_parse_and_cargo(self) -> None:
        rendered = (FIXTURE_DIR / "operator_index.rendered.html").read_text(encoding="utf-8")
        parse_payload = json.loads((FIXTURE_DIR / "operator_index.parse.json").read_text(encoding="utf-8"))
        cargo_payload = json.loads((FIXTURE_DIR / "operator_index.cargo.json").read_text(encoding="utf-8"))

        rendered_entries = parse_operator_entries_from_rendered_html(rendered)
        parse_entries = parse_operator_entries_from_parse_api(parse_payload)
        cargo_entries = parse_operator_entries_from_cargo(cargo_payload)

        self.assertEqual([entry.name for entry in rendered_entries], ["可露希尔", "测试干员无秘录"])
        self.assertEqual(parse_entries[0].name, "可露希尔")
        self.assertEqual(cargo_entries[0].profession, "辅助")
        self.assertEqual(cargo_entries[1].faction, "罗德岛")

    def test_operator_index_discovery_prefers_live_filter_data_divs(self) -> None:
        rendered = """
        <html><body>
            <a href="/w/%E9%87%87%E8%B4%AD%E4%B8%AD%E5%BF%83">采购中心</a>
            <div id="filter-data">
                <div data-zh="12F" data-profession="术师" data-rarity="1" data-logo="罗德岛"></div>
                <div data-zh="阿米娅" data-profession="术师" data-rarity="4" data-logo="罗德岛"></div>
            </div>
        </body></html>
        """

        entries = parse_operator_entries_from_rendered_html(rendered)

        self.assertEqual([entry.name for entry in entries], ["12F", "阿米娅"])
        self.assertTrue(all(entry.slug.startswith("operator-") for entry in entries))
        self.assertEqual(entries[1].profession, "术师")
        self.assertEqual(entries[1].faction, "罗德岛")

    def test_build_operator_index_writes_fixture_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            result = build_operator_index(
                operator_index_page="干员一览",
                output_dir=root / "public" / "data",
                cache_dir=root / ".cache" / "resources",
                rendered_fixture=FIXTURE_DIR / "operator_index.rendered.html",
                dry_run=True,
            )

            index_path = Path(result["operatorIndexPath"])
            payload = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["source"]["method"], "rendered-fixture")
            self.assertEqual(len(payload["operators"]), 2)

    def test_operator_export_manifest_extracts_archive_modules_and_confidential(self) -> None:
        manifest = parse_operator_export_manifest_html(
            operator_slug="operator-closur",
            operator_page="可露希尔",
            html="""
            <h2><span class="mw-headline" id="模组">模组</span></h2>
            <h3><span class="mw-headline" id="可露希尔证章">可露希尔证章</span></h3>
            <div>基础证章，无特殊效果。</div>
            <h3><span class="mw-headline" id="给自己的小奖杯">给自己的小奖杯</span><span class="mw-editsection">[编辑]</span></h3>
            <div>基础信息 第一段</div>
            <h2><span class="mw-headline" id="干员档案">干员档案</span></h2>
            <table><tr><td>档案</td></tr></table>
            <h2><span class="mw-headline" id="干员密录">干员密录</span></h2>
            <table>
              <tr>
                <td>
                  <b>精英化2 Lv.1</b>
                  <b>分身有术</b>
                  <a href="/w/%E5%8F%AF%E9%9C%B2%E5%B8%8C%E5%B0%94/%E5%B9%B2%E5%91%98%E5%AF%86%E5%BD%95/1">播放</a>
                </td>
              </tr>
            </table>
            """,
        )

        self.assertEqual(manifest["archive"][0]["id"], "operator-closur:archive")
        self.assertEqual([entry["title"] for entry in manifest["modules"]], ["给自己的小奖杯"])
        self.assertEqual(manifest["modules"][0]["id"], "operator-closur:module:operator-closur:module:2")
        self.assertEqual(manifest["confidential"][0]["title"], "分身有术")
        self.assertEqual(
            manifest["confidential"][0]["id"],
            "operator-closur:confidential:operator-closur:confidential:1",
        )


if __name__ == "__main__":
    unittest.main()
