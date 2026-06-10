#!/bin/bash
# Build and run (or restart) the app in Docker.
set -e
cd "$(dirname "$0")"

docker stop meeting-agenda 2>/dev/null && echo "Stopped existing container." || true
docker rm   meeting-agenda 2>/dev/null || true

echo "Building..."
docker build -t meeting-agenda .

mkdir -p data
docker run -d \
  --name meeting-agenda \
  -p 8000:8000 \
  -v "$(pwd)/data:/app/data" \
  meeting-agenda

echo "Running at http://localhost:8000"
