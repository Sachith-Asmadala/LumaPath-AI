# LumaPath FastAPI sidecar

Run from the repository root:

```bash
python -m uvicorn apps.api.app.main:app --reload --port 8000
```

The Study Assistant uses a deterministic structured provider by default, so no external AI key is required for the competition demo. `X-Luma-Student-Id` is a development identity boundary only; replace it with the production authentication dependency when the auth story lands.


DOC-F08 persists structured assistant sessions, approved actions, feedback, and audit metadata in SQLite (`LUMAPATH_DATABASE_PATH`). Raw prompts are never persisted. The current assistant-safe context snapshot stays process-local and is re-synced by the web app before requests.
