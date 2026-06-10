FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV NEXT_OUTPUT=export
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY --from=frontend-builder /app/frontend/out ./static

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/agenda.db

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
