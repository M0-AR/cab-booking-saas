#!/bin/sh
set -eu

echo "Applying database migrations (alembic upgrade head)..."
attempt=0
until alembic upgrade head; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "Migrations failed after $attempt attempts, giving up." >&2
        exit 1
    fi
    echo "Database not ready yet (attempt $attempt), retrying in 2s..."
    sleep 2
done

exec gunicorn app.main:app \
    --worker-class "${GUNICORN_WORKER_CLASS:-uvicorn_worker.UvicornWorker}" \
    --workers "${WEB_CONCURRENCY:-4}" \
    --bind "0.0.0.0:${PORT:-8000}" \
    --timeout 60 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
