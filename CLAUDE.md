# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NegotiateAI is an AI voice negotiation agent with a FastAPI backend orchestrator and a Next.js dashboard for live monitoring, history, and analysis. It supports outbound phone calls via Twilio, real-time transcription, and LLM-driven negotiation responses.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # ESLint
```

### Docker (both services)
```bash
docker-compose up --build
```

### Tests
```bash
cd backend && pytest    # pytest is in requirements.txt but no test files exist yet
```

## Architecture

### Backend (`backend/app/`)

FastAPI application (`app.main:app`) with service injection pattern. Services are instantiated in `main.py` and passed to route factories.

**Route modules** (`routes/`) use factory pattern — each exports `get_routes(dependencies)` returning an APIRouter:
- `tasks.py` — Task CRUD, call start/stop, audio download, analysis
- `ws.py` — WebSocket `/ws/call/{session_id}` for real-time call event subscription
- `twilio.py` — Twilio voice webhook (`/twilio/voice`), media stream WebSocket (`/twilio/media-stream`), status callback
- `telemetry.py` — Event logs and timing summaries from `data/telemetry_events.jsonl`

**Service layer** (`services/`):
- `orchestrator.py` — Central hub coordinating call lifecycle, LLM responses, audio persistence, and WebSocket broadcasting. Maps task_id → session_id.
- `session_manager.py` — In-memory `CallSession` objects (conversation history, transcript, status) with async lock
- `storage.py` — Dual storage: SQLite (`data/calls.db`) for task metadata, filesystem (`data/{task_id}/`) for audio WAVs, transcripts, analysis JSON
- `llm_client.py` — Multi-provider LLM abstraction with streaming. Providers: `OpenAICompatibleProvider` (OpenAI/vLLM), `AnthropicProvider`. Has fallback tokens if provider fails.
- `negotiation_engine.py` — Builds dynamic system prompts based on task config and turn count (opening/midgame/endgame phases), streams LLM responses
- `twilio_client.py` — Twilio REST API wrapper for `place_call`/`end_call`. Dry-run mode when credentials missing.
- `ws_manager.py` — WebSocket connection registry, broadcasts `CallEvent` JSON to subscribed clients
- `deepgram_voice_agent.py` — Optional Deepgram Voice Agent WebSocket client for end-to-end voice (STT → LLM → TTS)
- `audio_pipeline.py` — Sentence-boundary text buffer

**Config** (`core/config.py`): Pydantic settings loaded from `.env`. LLM provider selected via `LLM_PROVIDER` env var (`openai`|`anthropic`|`local`).

**Telemetry** (`core/telemetry.py`): Every operation wrapped in `timed_step()` context manager. Events written to JSONL + service.log.

**Models** (`models/schemas.py`): Pydantic models for task creation, summaries, transcript turns, WebSocket call events, analysis payloads.

### Frontend (`frontend/`)

Next.js 14 App Router with React 19, Tailwind CSS, TypeScript.

**Pages** (`app/`):
- `/` — Task creation form (client component `NewTaskForm`)
- `/call/[id]` — Live call monitor with WebSocket transcript streaming, agent thinking display, end-call button
- `/history` — Server-rendered task history listing
- `/history/[id]` — Server-rendered call detail with analysis and audio downloads

**Shared code** (`lib/`):
- `api.ts` — REST client functions + `createCallSocket(taskId, onEvent)` WebSocket helper
- `config.ts` — `BACKEND_API_URL` and `BACKEND_WS_URL` from `NEXT_PUBLIC_*` env vars (defaults: `http://localhost:3001`, `ws://localhost:3001`)
- `types.ts` — TypeScript types mirroring backend schemas

**Styling**: Dark glassmorphic theme with custom Tailwind config. Colors: `bg: #050816`, `panel: #0e1328`, `accent: #4f8cff`. Fonts: Space Grotesk (headings), Inter (body).

### Call Flow

1. Frontend creates task via `POST /api/tasks`, then starts call via `POST /api/tasks/{id}/call`
2. Backend orchestrator creates a session, calls Twilio to place outbound call
3. Twilio streams audio to `/twilio/media-stream` WebSocket
4. Orchestrator processes utterances through negotiation engine (LLM), saves audio chunks, broadcasts events
5. Frontend subscribes to `/ws/call/{session_id}` for real-time transcript/status updates
6. Call ends via user action or Twilio status callback; artifacts persisted to `data/{task_id}/`

## Environment Variables

Backend (`backend/.env`): `LLM_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `VLLM_BASE_URL`, `VLLM_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_HOST`, `DEEPGRAM_API_KEY`, `DEEPGRAM_VOICE_AGENT_ENABLED`

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_BACKEND_WS_URL`

## Key Conventions

- All backend I/O is async (httpx, aiofiles, WebSockets)
- LLM responses are always streamed via async generators
- Per-task artifacts stored at `backend/data/{task_id}/` (WAVs, transcript.json, conversation.json, analysis.json)
- Telemetry logs at `backend/data/service.log` and `backend/data/telemetry_events.jsonl`
- Missing Twilio/LLM credentials trigger dry-run/fallback behavior rather than crashes
