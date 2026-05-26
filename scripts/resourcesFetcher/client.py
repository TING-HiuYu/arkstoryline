from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode, urljoin
from urllib.request import Request, urlopen


class WikiClient:
    def __init__(
        self,
        cache_dir: Path | str,
        *,
        base_url: str = "https://prts.wiki/",
        user_agent: str = "ArkStorylineUrlFetcher/0.1",
        timeout_seconds: float = 20.0,
        retry_count: int = 2,
        rate_limit_seconds: float = 0.8,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.base_url = base_url.rstrip("/") + "/"
        self.user_agent = user_agent
        self.timeout_seconds = timeout_seconds
        self.retry_count = retry_count
        self.rate_limit_seconds = rate_limit_seconds
        self._last_request_at = 0.0

    def fetch_rendered_page(self, page: str) -> str:
        return self._request_text(self.build_page_url(page))[0]

    def fetch_parse_api(self, page: str) -> dict[str, Any]:
        return self._request_json(
            self.build_api_url(
                {
                    "action": "parse",
                    "page": page,
                    "prop": "text|revid",
                    "format": "json",
                    "formatversion": "2",
                }
            )
        )

    def cargo_query(self, **params: str) -> dict[str, Any]:
        return self._request_json(self.build_api_url({"action": "cargoquery", "format": "json", **params}))

    def build_page_url(self, page: str) -> str:
        return urljoin(self.base_url, "w/" + quote(page, safe="/"))

    def build_api_url(self, query: dict[str, str]) -> str:
        return urljoin(self.base_url, "api.php") + "?" + urlencode(query)

    def _request_json(self, url: str) -> dict[str, Any]:
        payload = json.loads(self._request_text(url)[0])
        if not isinstance(payload, dict):
            raise ValueError(f"Expected object JSON from {url}")
        return payload

    def _request_text(self, url: str) -> tuple[str, dict[str, str]]:
        last_error: Exception | None = None
        for attempt in range(self.retry_count + 1):
            try:
                self._respect_rate_limit()
                request = Request(url, headers={"User-Agent": self.user_agent})
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    headers = {key.lower(): value for key, value in response.headers.items()}
                    return response.read().decode("utf-8", "replace"), headers
            except Exception as error:
                last_error = error
                if attempt >= self.retry_count:
                    break
                time.sleep(0.5 * (attempt + 1))
        raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error

    def _respect_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.rate_limit_seconds:
            time.sleep(self.rate_limit_seconds - elapsed)
        self._last_request_at = time.monotonic()
