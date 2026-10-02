FROM python:3.11-slim
WORKDIR /workspace
COPY apps/api/pyproject.toml /workspace/apps/api/pyproject.toml
COPY apps/api/app /workspace/apps/api/app
RUN pip install --no-cache-dir /workspace/apps/api
COPY apps/worker /workspace/apps/worker
ENV PYTHONPATH=/workspace
CMD ["python", "-m", "apps.worker.jobs.notifications.loop"]
