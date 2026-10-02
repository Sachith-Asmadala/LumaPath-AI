# Document processing worker contract

DOC-F09 exposes document processing through `DocumentJobDispatcher`.

The competition prototype uses a bounded in-process `ThreadPoolExecutor` so uploads return immediately and persistent SQLite state can move through `queued -> processing -> ready|failed` without blocking the request.

A production deployment should replace only the dispatcher adapter with a durable queue such as Celery/RQ/SQS and invoke `DocumentService.process(document_id, owner_id)` from the worker. The HTTP contract, repository state machine, extractors and frontend polling contract do not need to change.

Operational expectations:

- queue messages contain only `document_id` and `owner_id`, never the document bytes;
- the worker reads the private object through the storage adapter;
- retries remain bounded by `DOCUMENT_MAX_PROCESSING_ATTEMPTS`;
- duplicate uploads are de-duplicated per owner using SHA-256;
- failed jobs preserve a safe error code/message and never fabricate analysis;
- retention cleanup deletes source files and derived rows together.
