#!/bin/sh
# Runs on every container start (every deploy): apply any pending migrations
# before serving traffic, so deployed code and the live schema can never
# drift out of sync again. `alembic upgrade head` is a no-op if already
# current, so this is safe to run unconditionally, including locally.
set -e

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting server..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
