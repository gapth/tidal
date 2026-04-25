FROM python:3.11-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY packages/pipeline/requirements.txt ./packages/pipeline/requirements.txt
COPY apps/worker/requirements.txt ./apps/worker/requirements.txt
RUN pip install --no-cache-dir \
    -r packages/pipeline/requirements.txt \
    -r apps/worker/requirements.txt

# Copy source
COPY packages/pipeline/pipeline/ ./pipeline/
COPY apps/worker/worker/ ./worker/

ENV PYTHONPATH=/app

CMD ["uvicorn", "worker.main:app", "--host", "0.0.0.0", "--port", "8080"]
