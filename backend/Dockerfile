FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt tzdata
COPY backend /app/backend
COPY reports/phase2/manifest_1h.json reports/phase2/manifest_3h.json reports/phase2/metrics.csv /app/reports/phase2/
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
