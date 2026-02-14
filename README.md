# NegotiateAI MVP

NegotiateAI is a local-or-API-driven voice negotiation agent scaffold for TreeHacks-style demos.
It includes a FastAPI orchestrator and a Next.js dashboard for live monitoring, history, and analysis.

## Repository Layout

- `backend/` — FastAPI orchestrator and service layer.
  - `app/` API routes + orchestration services.
  - `requirements.txt` and `.env.example`.
- `frontend/` — Next.js dashboard.
  - Pages for task creation, live call monitor, and history.
- `docker-compose.yml` — optional local bootstrap for both services.
- `QUICKSTART.md` — end-to-end startup guide.

## Features in this MVP

- Negotiation task creation and call lifecycle endpoints
- Live dashboard + transcript stream over WebSocket
- Twilio endpoint skeletons for outbound/inbound call flow
- Session/task persistence in SQLite + filesystem artifacts
- Modular LLM provider configuration (`openai`, `anthropic`, `local`)
- Audio/recording scaffolding for mixed inbound/outbound streams

## Quickstart

```bash
# copy and edit environment variables
cp .env.example backend/.env
cp .env.example frontend/.env.local

# backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 3001

# frontend (new terminal)
cd ../frontend
npm install
npm run dev
```

Then open:
- `http://localhost:3000` (dashboard)
- `http://localhost:3001/health` (backend health)

## Environment and Secrets

Use `backend/.env` for server-side values and `frontend/.env.local` for browser values.
- Backend example: `backend/.env.example`
- Frontend example: `frontend/.env.example`
- Full combined reference: `/.env.example`

For web lookup caching, set one of:
- `UPSTASH_REDIS_URL=rediss://default:...@frank-glider-40323.upstash.io:6379`
- or `REDIS_URL=<same redis connection>`

Optional tuning:
- `CACHE_ENABLED=true|false`
- `CACHE_DEFAULT_TTL_SECONDS`
- `CACHE_RESEARCH_TTL_SECONDS`
- `CACHE_TASK_TTL_SECONDS`
- `CACHE_ANALYSIS_TTL_SECONDS`

### LLM provider examples

- OpenAI (default):
  - `LLM_PROVIDER=openai`
  - `OPENAI_API_KEY=...`
  - `OPENAI_MODEL=gpt-4o-mini`

- Anthropic (Claude):
  - `LLM_PROVIDER=anthropic`
  - `ANTHROPIC_API_KEY=...`

- Local DGX/vLLM:
  - `LLM_PROVIDER=local`
  - `VLLM_BASE_URL=http://localhost:8000`
  - `VLLM_API_KEY` is optional for local endpoints unless auth is enabled.

## Running with Docker

```bash
docker-compose up --build
```

## API surface

- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `POST /api/tasks/{id}/call`
- `POST /api/tasks/{id}/stop`
- `GET /api/tasks/{id}/audio`
- `GET /api/tasks/{id}/analysis`
- `GET /api/telemetry/recent`
- `GET /api/telemetry/summary`
- `WS /ws/call/{id}`
- `POST /twilio/voice`
- `WS /twilio/media-stream`
- `POST /twilio/status`

Telemetry output lives under `backend/data/service.log` and `backend/data/telemetry_events.jsonl`.

## CLI-first validation

```bash
cd backend
source .venv/bin/activate

# Automated test groups
./scripts/run-tests.sh
pytest -q -m unit
pytest -q -m integration
pytest -q -m ws
pytest -q -m benchmark

# API + websocket smoke
python scripts/smoke_api.py --base-url http://127.0.0.1:3001
python scripts/smoke_api.py --base-url http://127.0.0.1:3001 --no-websocket
```
