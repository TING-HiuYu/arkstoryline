from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ResourceDiagnostics:
    missing_pages: list[str] = field(default_factory=list)
    missing_templates: list[str] = field(default_factory=list)
    parse_failures: list[dict[str, str]] = field(default_factory=list)
    missing_resources: list[dict[str, str]] = field(default_factory=list)
    failed_urls: list[dict[str, str]] = field(default_factory=list)
    disabled_sources: list[str] = field(default_factory=list)
    duplicate_reference_count: int = 0
    retry_count: int = 0
    download_attempt_count: int = 0
    downloaded_bytes: int = 0
    downloaded_file_count: int = 0

    def as_json(self, stats: dict[str, int]) -> dict[str, object]:
        return {
            "stats": stats,
            "failedUrls": self.failed_urls,
            "missingPages": self.missing_pages,
            "missingTemplates": self.missing_templates,
            "parseFailures": self.parse_failures,
            "missingResources": self.missing_resources,
            "disabledSources": sorted(set(self.disabled_sources)),
            "duplicateReferenceCount": self.duplicate_reference_count,
            "retryCount": self.retry_count,
            "downloadAttemptCount": self.download_attempt_count,
            "downloadedBytes": self.downloaded_bytes,
            "downloadedFileCount": self.downloaded_file_count,
        }
