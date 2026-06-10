#!/bin/bash
# Start (or restart) both servers for local development.
# Backend: FastAPI on :8000   Frontend: Next.js on :3000
set -e
cd "$(dirname "$0")"

# Kill anything already on these ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Backend — use uv
if [ ! -d ".venv" ]; then
  uv venv
fi
uv pip install -r backend/requirements.txt --quiet

source .venv/bin/activate
DATABASE_PATH=./agenda.db uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Frontend
cd frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait $BACKEND_PID $FRONTEND_PID
