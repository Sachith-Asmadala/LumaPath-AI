# DOC-F18 analytics aggregation job

`AnalyticsAggregationDispatcher` is the background-job boundary for daily and weekly aggregates.
The competition prototype uses a small thread pool inside the API process. Production can replace
that dispatcher with Celery/RQ/SQS while preserving the same event and aggregate contracts.

Jobs are backfill-safe: a late event causes a new aggregate **revision** to be appended for the
affected local day and ISO-style Monday-Sunday week. Older aggregate revisions remain auditable.
