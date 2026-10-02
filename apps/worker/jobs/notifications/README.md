# DOC-F20 notification delivery worker

`run.py` performs one idempotent notification-delivery iteration. A production scheduler can invoke it every minute (or move the same service calls into Celery/RQ/SQS workers).

The worker does **not** generate arbitrary messages. It reuses the FastAPI notification policy and durable candidate/delivery tables, so quiet hours, expiry, frequency caps, deduplication and owner scope remain identical to the HTTP path.

External push/email adapters are intentionally disabled in this prototype. A later provider adapter must:

1. require an explicit user channel preference/permission;
2. use `delivery_id` as the provider idempotency key;
3. render the privacy-safe external preview, not raw task/CV/mentor content;
4. implement unsubscribe/revocation before production use.

DOC-F23 can feed confirmed calendar candidates through the same `calendar_event` type without changing this worker.


The supplied `apps/worker/Dockerfile` runs `loop.py` with a default 60-second interval and shares the API SQLite/data volume in `docker-compose.yml`. The loop has a 15-second lower bound to avoid accidental busy polling.
