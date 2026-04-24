FROM python:3.11-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY pipeline/requirements.txt ./pipeline/requirements.txt
COPY worker/requirements.txt ./worker/requirements.txt
RUN pip install --no-cache-dir \
    -r pipeline/requirements.txt \
    -r worker/requirements.txt

# Copy source
COPY pipeline/ ./pipeline/
COPY worker/ ./worker/

ENV PYTHONPATH=/app

CMD ["uvicorn", "worker.main:app", "--host", "0.0.0.0", "--port", "8080"]
