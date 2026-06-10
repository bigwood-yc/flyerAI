FROM python:3.11-slim

# Unbuffered output → logs appear immediately in Render / Docker
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install deps in a separate layer so rebuilds are fast when only source changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render mounts the persistent disk at /data; create it so local docker run works too
RUN mkdir -p /data

EXPOSE 8000

# Single worker: keeps all in-process caches (_FLYER_CACHE, _rec_cache, etc.)
# consistent. Switch to --workers 2 only after migrating off SQLite.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
