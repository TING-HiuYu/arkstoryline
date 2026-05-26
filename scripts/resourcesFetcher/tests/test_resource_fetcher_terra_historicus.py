import unittest

from scripts.resourcesFetcher.terra_historicus import parse_terra_historicus_comics


class TerraHistoricusTest(unittest.TestCase):
    def test_parse_comics_from_initial_props(self) -> None:
        html = """
        <script>
          window.g_initialProps = {"comic":{"comicList":[
            {"cid":"0694","cover":"https:\\/\\/web.hycdn.cn\\/comic\\/cover.jpg","title":"序言组曲：孤行之人","subtitle":"","authors":["鹰角网络"]},
            {"cid":"4578","cover":"https:\\/\\/web.hycdn.cn\\/comic\\/coin.png","title":"循途漫录：王权金币","subtitle":"", "authors":["鹰角网络"]}
          ]}};
        </script>
        """

        comics = parse_terra_historicus_comics(html)

        self.assertEqual(len(comics), 2)
        self.assertEqual(comics[0].cid, "0694")
        self.assertEqual(comics[0].title, "序言组曲：孤行之人")
        self.assertEqual(comics[0].kind, "terraHistoricusComic")
        self.assertEqual(comics[0].url, "https://comic.hypergryph.com/terra-historicus/comic/0694")


if __name__ == "__main__":
    unittest.main()
