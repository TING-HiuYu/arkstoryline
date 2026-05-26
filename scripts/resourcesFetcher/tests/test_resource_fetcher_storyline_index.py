from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.resourcesFetcher.storyline_index import (
    build_storyline_index,
    parse_storyline_entries_from_cargo,
    parse_storyline_entries_from_rendered_html,
)

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"


class StorylineRenderedParserTest(unittest.TestCase):
    def test_rendered_storyline_parser_covers_all_target_sections(self) -> None:
        rendered = (FIXTURE_DIR / "storyline_index.rendered.html").read_text(encoding="utf-8")
        entries = parse_storyline_entries_from_rendered_html(rendered)

        sections = {entry.section for entry in entries}
        self.assertEqual(sections, {"mainline", "sidestory", "sideStory", "cc"})

        by_section = {section: [item.page for item in entries if item.section == section] for section in sections}
        self.assertIn("主线/EP00/EP00_BEG", by_section["mainline"])
        self.assertIn("别传/OF/OF_ST_1", by_section["sidestory"])
        self.assertIn("故事集/CB/CB-1", by_section["sideStory"])
        self.assertIn("危机合约/CC/行动前", by_section["cc"])

    def test_activity_table_row_labels_drive_live_sections(self) -> None:
        rendered = """
        <table>
            <tr><th>活动剧情一览</th></tr>
            <tr><th>支线</th><td><a href="/w/别传/OF/OF_ST_1" title="火蓝之心">火蓝之心</a></td></tr>
            <tr><th>剧情</th><td><a href="/w/多维合作/剧情" title="多维合作保全派驻卫戍协议">多维合作保全派驻卫戍协议</a></td></tr>
            <tr><th>危机合约</th><td><a href="/w/危机合约/CC/行动前" title="行动前">行动前</a></td></tr>
            <tr><th>集成战略</th><td><a href="/w/傀影与猩红孤钻/IS_ST_1" title="傀影与猩红孤钻">傀影与猩红孤钻</a></td></tr>
        </table>
        """

        entries = parse_storyline_entries_from_rendered_html(rendered)
        section_by_page = {entry.page: entry.section for entry in entries}
        metadata_by_page = {entry.page: entry for entry in entries}

        self.assertEqual(section_by_page["别传/OF/OF_ST_1"], "sidestory")
        self.assertEqual(section_by_page["多维合作/剧情"], "other")
        self.assertEqual(metadata_by_page["多维合作/剧情"].group_title, "剧情")
        self.assertEqual(metadata_by_page["多维合作/剧情"].album_title, "多维合作保全派驻卫戍协议")
        self.assertEqual(section_by_page["危机合约/CC/行动前"], "other")
        self.assertEqual(section_by_page["傀影与猩红孤钻/IS_ST_1"], "other")

    def test_table_story_rows_stay_in_current_storyline_section(self) -> None:
        rendered = """
        <table>
            <tr><th>主线剧情一览</th></tr>
            <tr>
                <th>特殊</th>
                <th>剧情</th>
                <td>
                    <a href="/w/EP09/ENTRY" title="EP09/ENTRY">EP09 序曲</a>
                    <a href="/w/15-17_“她”/END/SP1" title="15-17 “她”/END/SP1">15-17 “她” 行动后 SIDE:ACCEPT</a>
                </td>
            </tr>
            <tr><th>活动剧情一览</th></tr>
            <tr>
                <th>特殊</th>
                <th>剧情</th>
                <td><a href="/w/多维合作/剧情" title="多维合作/剧情">多维合作</a></td>
            </tr>
        </table>
        """

        entries = parse_storyline_entries_from_rendered_html(rendered)
        by_page = {entry.page: entry for entry in entries}

        self.assertEqual(by_page["EP09/ENTRY"].section, "mainline")
        self.assertEqual(by_page["15-17_“她”/END/SP1"].section, "mainline")
        self.assertEqual(by_page["多维合作/剧情"].section, "other")
        self.assertEqual(by_page["多维合作/剧情"].group_title, "特殊")

    def test_activity_table_rows_keep_group_album_and_chapter_titles(self) -> None:
        rendered = """
        <table>
            <tr><th>活动剧情一览</th></tr>
            <tr><th>集成战略</th></tr>
            <tr>
                <th>岁的界园志异</th>
                <td>
                    <a href="/w/RO5-BEG/NBT" title="RO5-BEG/NBT">序章</a>
                    <a href="/w/RO5-END-5/NBT" title="RO5-END-5/NBT">落子无悔</a>
                </td>
            </tr>
        </table>
        """

        entries = parse_storyline_entries_from_rendered_html(rendered)
        by_page = {entry.page: entry for entry in entries}

        intro = by_page["RO5-BEG/NBT"]
        ending = by_page["RO5-END-5/NBT"]

        self.assertEqual(intro.section, "other")
        self.assertEqual(intro.group_title, "集成战略")
        self.assertEqual(intro.album_title, "岁的界园志异")
        self.assertEqual(intro.chapter_title, "序章")
        self.assertEqual(intro.page_title, "RO5-BEG/NBT")
        self.assertEqual(ending.chapter_title, "落子无悔")

    def test_activity_story_rows_use_first_column_as_album_when_secondary_is_story(self) -> None:
        rendered = """
        <table>
            <tr><th>活动剧情一览</th></tr>
            <tr>
                <th>洪炉示岁</th>
                <th>剧情</th>
                <td>
                    <a href="/w/AF-ST1_洪炉示岁·迎春/NBT" title="AF-ST1 洪炉示岁·迎春/NBT">洪炉示岁·迎春</a>
                    <a href="/w/AF-ST2_洪炉示岁·贺岁/NBT" title="AF-ST2 洪炉示岁·贺岁/NBT">洪炉示岁·贺岁</a>
                    <a href="/w/AF-ST3_洪炉示岁·拜年/NBT" title="AF-ST3 洪炉示岁·拜年/NBT">洪炉示岁·拜年</a>
                </td>
            </tr>
        </table>
        """

        entries = parse_storyline_entries_from_rendered_html(rendered)
        by_page = {entry.page: entry for entry in entries}

        first = by_page["AF-ST1_洪炉示岁·迎春/NBT"]
        third = by_page["AF-ST3_洪炉示岁·拜年/NBT"]

        self.assertEqual(first.section, "sideStory")
        self.assertIsNone(first.group_title)
        self.assertEqual(first.album_title, "洪炉示岁")
        self.assertEqual(first.chapter_title, "洪炉示岁·迎春")
        self.assertEqual(third.album_title, "洪炉示岁")
        self.assertEqual(third.chapter_title, "洪炉示岁·拜年")

    def test_activity_special_rows_keep_special_as_category_and_row_header_as_album(self) -> None:
        rendered = """
        <table>
            <tr><th>活动剧情一览</th></tr>
            <tr><th>特殊</th></tr>
            <tr>
                <th>荷谟伊智境</th>
                <td>
                    <a href="/w/CR-BEG/NBT" title="CR-BEG/NBT">固定开头AVG</a>
                    <a href="/w/CR-ST1/NBT" title="CR-ST1/NBT">开头AVG</a>
                </td>
            </tr>
        </table>
        """

        entries = parse_storyline_entries_from_rendered_html(rendered)
        by_page = {entry.page: entry for entry in entries}

        first = by_page["CR-BEG/NBT"]

        self.assertEqual(first.section, "other")
        self.assertEqual(first.group_title, "特殊")
        self.assertEqual(first.album_title, "荷谟伊智境")
        self.assertEqual(first.chapter_title, "固定开头AVG")

    def test_cargo_parser_maps_category_and_story_set_type(self) -> None:
        payload = json.loads((FIXTURE_DIR / "storyline_index.cargo.json").read_text(encoding="utf-8"))
        entries = parse_storyline_entries_from_cargo(payload)

        section_page_pairs = {(item.section, item.page) for item in entries}
        self.assertIn(("cc", "危机合约/CC/旧约"), section_page_pairs)
        self.assertIn(("mainline", "主线/EP11/EP11_BEG"), section_page_pairs)


class StorylineBuildTest(unittest.TestCase):
    def test_storyline_builder_falls_back_to_parse_when_rendered_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            result = build_storyline_index(
                storyline_page="剧情一览",
                output_dir=root / "public" / "data",
                cache_dir=root / ".cache" / "resources",
                parse_fixture=FIXTURE_DIR / "storyline_index.parse.json",
                dry_run=True,
            )

            index_path = Path(result["storylineIndexPath"])
            payload = json.loads(index_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["source"]["method"], "parse-api")
        self.assertEqual(payload["sections"]["mainline"][0]["page"], "主线/EP10/EP10_BEG")
        self.assertEqual(payload["sections"]["sidestory"], [])
        self.assertEqual(payload["sections"]["sideStory"], [])
        self.assertEqual(payload["sections"]["cc"], [])
        self.assertEqual(payload["sections"]["other"], [])


if __name__ == "__main__":
    unittest.main()
