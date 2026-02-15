<p align="center">
  <img src="frontend/public/favicon.png" alt="kiru" width="96" />
</p>

# kiru

kiru is a local-or-API-driven voice negotiation agent scaffold for TreeHacks-style demos.
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

Preferred dev flow (single terminal):

```bash
scripts/dev-up.sh
```

Then open:
- `http://localhost:3000` (dashboard)
- `http://localhost:3001/health` (backend health)

To use alternate host ports when 3000/3001 are occupied:

```bash
BACKEND_HOST_PORT=3002 FRONTEND_HOST_PORT=3003 ./scripts/dev-up.sh
```

This automatically points the frontend env to `http://localhost:3002` for API/ws by compose interpolation.

`scripts/dev-up.sh` also auto-resolves occupied host ports by default:

```bash
AUTO_FIX_PORTS=0 ./scripts/dev-up.sh
```

The command above disables automatic reassignment and restores strict fail-fast behavior.

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
- `LOG_LEVEL=INFO|DEBUG|WARNING|ERROR`
- `LOG_NOISY_EVENTS_EVERY_N=120`
- `LOG_NOISY_ACTIONS=media_event,save_audio_chunk,media_mark_received`
- `LOG_SKIP_REQUEST_PATHS=/health`
- `LOG_PRETTY=true`
- `LOG_COLOR=auto`

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
scripts/dev-up.sh
```

Or with raw compose (if you prefer direct compose commands):

```bash
docker compose up --build
```

The compose stack now mounts `backend/.env` and `frontend/.env.local`, and backend runs with `--reload` for hot code changes.

Troubleshooting:
- If compose is not available as `docker compose`, install/update Docker CLI/Compose plugin.
- If startup reports a permission error to `/var/run/docker.sock`, add your user to the docker group and restart your shell:
  - `sudo usermod -aG docker $USER`
  - `newgrp docker`

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
`LOG_NOISY_EVENTS_EVERY_N` controls how often chatty events are logged to stdout/file:
- `media_event`
- `save_audio_chunk`
- `twilio.media_mark_received`

Set `LOG_NOISY_EVENTS_EVERY_N=0` to suppress all noisy ok-status events while keeping warnings/errors.

`LOG_PRETTY` enables compact structured console output.
`LOG_COLOR=auto` auto-detects color support (TTY-based). Use `true` or `false` to force.

Run this before starting the stack to catch missing call keys:

```bash
./scripts/preflight.sh
```

Skip checks with `SKIP_PREFLIGHT=1` and continue in warn-only mode with `PRECHECK_STRICT=0`.

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
