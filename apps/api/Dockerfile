FROM python:3.11-slim
WORKDIR /app
COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api/app ./apps/api/app
COPY src/data/demo/competition-scenario.json ./src/data/demo/competition-scenario.json
COPY scripts/seed-data/seed-competition-demo.py scripts/seed-data/seed-doc-f34-demo.py ./scripts/seed-data/
RUN pip install --no-cache-dir ./apps/api
EXPOSE 8000
CMD ["uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
