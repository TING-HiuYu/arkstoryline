from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_env_files() -> None:
    for env_path in (PROJECT_ROOT / ".env", PROJECT_ROOT / ".env.local"):
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


load_env_files()


def env_str(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True, slots=True)
class ResourceFetcherConfig:
    data_dir: str = env_str("ARK_DATA_DIR", "public/data")
    zh_data_dir: str = env_str("ARK_ZH_DATA_DIR", "public/data/zh_CN")
    cache_dir: str = env_str("ARK_CACHE_DIR", ".cache/resources")
    locale: str = env_str("ARK_LOCALE", "zh_CN")

    storyline_index: str = env_str("ARK_STORYLINE_INDEX", "public/data/storyline/index.json")
    operator_index: str = env_str("ARK_OPERATOR_INDEX", "public/data/operator/index.json")

    storyline_page: str = env_str("ARK_STORYLINE_PAGE", "剧情一览")
    operator_index_page: str = env_str("ARK_OPERATOR_INDEX_PAGE", "干员一览")
    terra_historicus_url: str = env_str(
        "ARK_TERRA_HISTORICUS_URL",
        "https://comic.hypergryph.com/terra-historicus/",
    )


CONFIG = ResourceFetcherConfig()
