# Quickstart

This project is a modular MVP for an AI voice-negotiation agent with a FastAPI backend and Next.js dashboard.

## 1) Prerequisites

- Python 3.10+
- Node.js 18+
- Optional but recommended: `ffmpeg`/audio tools for local media experiments
- For telephony: Twilio account and phone number

## 2) Clone

```bash
git clone https://github.com/Pranav-Karra-3301/treehacks-26.git
cd treehacks-26
```

## 3) Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
```

Edit `backend/.env` to match your environment. See `backend/.env.example` sections below.

```bash
# Run backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

## 4) Frontend setup

```bash
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` and calls backend on `http://localhost:3001` by default.

## 5) Launch both via Docker

Run both services from a single terminal (recommended for rapid iteration):

```bash
scripts/dev-up.sh
```

The containerized backend now runs with `--reload`, so code changes are picked up without restarting the stack.

Or run compose directly once env files are in place:

```bash
docker compose up --build
```

If port `3000` or `3001` is already in use on your machine, `scripts/dev-up.sh` now auto-selects nearby free ports by default:

```bash
BACKEND_HOST_PORT=3002 FRONTEND_HOST_PORT=3003 docker compose up --build
BACKEND_HOST_PORT=3002 FRONTEND_HOST_PORT=3003 ./scripts/dev-up.sh
```

To keep strict behavior and fail immediately when ports are occupied, disable auto-fix:

```bash
AUTO_FIX_PORTS=0 ./scripts/dev-up.sh
```

When using alternate host ports, the frontend URL variables are auto-adjusted to match `BACKEND_HOST_PORT` for API/WS calls.

If you get daemon permission errors, start Docker and add your user to the docker group before rerunning:

```bash
sudo systemctl start docker
sudo usermod -aG docker "$USER"
newgrp docker
```

## 6) Configure LLM provider (important)

Edit `backend/.env`:

```bash
LLM_PROVIDER=openai      # or anthropic, local
OPENAI_API_KEY=...      # required for openai
ANTHROPIC_API_KEY=...   # required for anthropic
VLLM_BASE_URL=http://localhost:8000  # required for local
```

For local DGX/vLLM you can set:

```bash
LLM_PROVIDER=local
VLLM_MODEL=Qwen/Qwen3-30B-A3B-Instruct-2507
VLLM_BASE_URL=http://localhost:8000
  # VLLM_API_KEY can stay empty unless your local endpoint enforces auth.
```

### Enable Deepgram voice pipeline (Twilio stream + STT/TTS + LLM routing)

```bash
DEEPGRAM_API_KEY=
DEEPGRAM_VOICE_AGENT_ENABLED=true
DEEPGRAM_VOICE_AGENT_THINK_PROVIDER=openai
DEEPGRAM_VOICE_AGENT_THINK_MODEL=gpt-4o-mini
# Leave endpoint URL empty for standard OpenAI-compatible providers.
DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL=
```

Twilio requires a public webhook host (ngrok or similar):

```bash
TWILIO_WEBHOOK_HOST=https://your-public-ngrok-url
```

## 7) Sanity checks

- Backend health: `curl http://localhost:3001/health`
- Create task: `POST http://localhost:3001/api/tasks`
- Start call: `POST http://localhost:3001/api/tasks/<task_id>/call`

## 8) Profiling and recordings

- View timing events:

```bash
curl "http://localhost:3001/api/telemetry/recent?limit=200"
```

- View timing summary:

```bash
curl "http://localhost:3001/api/telemetry/summary?limit=500"
```

- Check per-task recordings + size accounting:

```bash
curl "http://localhost:3001/api/tasks/<task_id>/recording-metadata"
curl "http://localhost:3001/api/tasks/<task_id>/recording-files"
```

Logs are written in:

- `backend/data/service.log`
- `backend/data/telemetry_events.jsonl`

## 9) CLI-first verification

```bash
cd backend
source .venv/bin/activate

# Run grouped test suites from terminal
./scripts/run-tests.sh

# Or run specific markers
pytest -q -m unit
pytest -q -m integration
pytest -q -m ws
pytest -q -m benchmark
```

```bash
# Run API + websocket smoke checks with timing output
python scripts/smoke_api.py --base-url http://127.0.0.1:3001
python scripts/smoke_api.py --base-url http://127.0.0.1:3001 --no-websocket
```

Useful smoke outputs:
- `/health` latency
- Task create/list/read
- websocket call status event timing
- call start/stop and task state transitions
- `/api/tasks/{id}/analysis` and `/api/telemetry/summary`
