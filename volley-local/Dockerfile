FROM node:22.15.0-bookworm-slim AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.10.16-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend backend
COPY config.yaml .
COPY --from=ui /ui/dist frontend/dist
CMD ["python","-m","uvicorn","backend.app.main:app","--host","0.0.0.0","--port","8765"]
