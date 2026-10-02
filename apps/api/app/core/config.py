from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = "LumaPath API"
    environment: str = os.getenv("LUMAPATH_ENV", "development")
    assistant_prompt_retention_hours: int = int(os.getenv("ASSISTANT_PROMPT_RETENTION_HOURS", "0"))
    assistant_session_retention_hours: int = int(os.getenv("ASSISTANT_SESSION_RETENTION_HOURS", "72"))
    assistant_rate_limit_per_minute: int = int(os.getenv("ASSISTANT_RATE_LIMIT_PER_MINUTE", "15"))
    database_path: str = os.getenv("LUMAPATH_DATABASE_PATH", "./apps/api/data/lumapath.db")
    document_storage_path: str = os.getenv("DOCUMENT_STORAGE_PATH", "./apps/api/data/private-documents")
    document_max_upload_bytes: int = int(os.getenv("DOCUMENT_MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
    document_retention_days: int = int(os.getenv("DOCUMENT_RETENTION_DAYS", "30"))
    document_require_malware_scan: bool = os.getenv("DOCUMENT_REQUIRE_MALWARE_SCAN", "false").lower() in {"1", "true", "yes"}
    document_worker_threads: int = int(os.getenv("DOCUMENT_WORKER_THREADS", "2"))
    document_max_processing_attempts: int = int(os.getenv("DOCUMENT_MAX_PROCESSING_ATTEMPTS", "3"))
    document_uploads_per_minute: int = int(os.getenv("DOCUMENT_UPLOADS_PER_MINUTE", "8"))
    analytics_worker_threads: int = int(os.getenv("ANALYTICS_WORKER_THREADS", "1"))
    analytics_min_cohort_size: int = int(os.getenv("ANALYTICS_MIN_COHORT_SIZE", "10"))
    institutional_analytics_retention_days: int = int(os.getenv("INSTITUTIONAL_ANALYTICS_RETENTION_DAYS", "365"))
    institutional_analytics_freshness_hours: int = int(os.getenv("INSTITUTIONAL_ANALYTICS_FRESHNESS_HOURS", "24"))
    institutional_analytics_subject_key_secret: str = os.getenv(
        "INSTITUTIONAL_ANALYTICS_SUBJECT_KEY_SECRET",
        "lumapath-development-subject-key-change-me",
    )
    institutional_analytics_purpose: str = os.getenv(
        "INSTITUTIONAL_ANALYTICS_PURPOSE",
        "student_support_programme_improvement",
    )
    portfolio_analyses_per_minute: int = int(os.getenv("PORTFOLIO_ANALYSES_PER_MINUTE", "10"))
    opportunity_source_freshness_days: int = int(os.getenv("OPPORTUNITY_SOURCE_FRESHNESS_DAYS", "30"))
    content_feed_daily_limit: int = int(os.getenv("CONTENT_FEED_DAILY_LIMIT", "8"))
    content_feed_per_source_limit: int = int(os.getenv("CONTENT_FEED_PER_SOURCE_LIMIT", "2"))
    content_feed_per_category_limit: int = int(os.getenv("CONTENT_FEED_PER_CATEGORY_LIMIT", "3"))
    portfolio_integration_ingest_key: str = os.getenv("PORTFOLIO_INTEGRATION_INGEST_KEY", "")
    cv_storage_path: str = os.getenv("CV_STORAGE_PATH", "./apps/api/data/private-cv")
    cv_max_upload_bytes: int = int(os.getenv("CV_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))
    cv_require_malware_scan: bool = os.getenv("CV_REQUIRE_MALWARE_SCAN", "false").lower() in {"1", "true", "yes"}
    cv_analyses_per_minute: int = int(os.getenv("CV_ANALYSES_PER_MINUTE", "8"))
    notification_delivery_max_attempts: int = int(os.getenv("NOTIFICATION_DELIVERY_MAX_ATTEMPTS", "3"))
    calendar_max_upload_bytes: int = int(os.getenv("CALENDAR_MAX_UPLOAD_BYTES", str(2 * 1024 * 1024)))
    calendar_credential_key: str = os.getenv("CALENDAR_CREDENTIAL_KEY", "")
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "LUMAPATH_CORS_ORIGINS",
            "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001",
        ).split(",")
        if origin.strip()
    )


settings = Settings()
