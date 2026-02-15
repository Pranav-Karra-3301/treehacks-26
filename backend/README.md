# Backend (FastAPI)

## Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3001
```

Set runtime configuration in `backend/.env` from `backend/.env.example`.

## LLM provider configuration

Set `LLM_PROVIDER`:

- `LLM_PROVIDER=openai` for OpenAI
- `LLM_PROVIDER=anthropic` for Claude
- `LLM_PROVIDER=groq` for Groq (OpenAI-compatible endpoint)
- `LLM_PROVIDER=local` for DGX/vLLM

Required keys per provider:

- OpenAI: `OPENAI_API_KEY`
- Groq: `GROQ_API_KEY`
- Claude: `ANTHROPIC_API_KEY`
- Local: `VLLM_BASE_URL` and `VLLM_MODEL`

## REST Endpoints

- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `POST /api/tasks/{id}/call`
- `POST /api/tasks/{id}/stop`
- `GET /api/tasks/{id}/audio`
- `GET /api/tasks/{id}/analysis`

## WebSocket

- `WS /ws/call/{id}`

## Twilio Hooks

- `POST /twilio/voice`
- `WS /twilio/media-stream`
- `POST /twilio/status`

## Telemetry and Profiling

- Event logs are written to:
  - `backend/data/service.log` (human-readable log stream)
  - `backend/data/telemetry_events.jsonl` (structured timing events)
- Inspect recent events:
  - `GET /api/telemetry/recent`
- Inspect timing profile summary (avg/min/max/percentiles):
  - `GET /api/telemetry/summary`

Both endpoints support query-based filtering on recent events when using the raw endpoint:

- `GET /api/telemetry/recent?limit=200&component=audio&action=save_audio_chunk`

## CLI verification

```bash
cd backend
source .venv/bin/activate

# Run all tests and grouped suites in one command
./scripts/run-tests.sh

# Run test subsets directly
pytest -q -m unit
pytest -q -m integration
pytest -q -m ws
pytest -q -m benchmark
```

```bash
# Run live REST + websocket smoke checks
python scripts/smoke_api.py --base-url http://127.0.0.1:3001
python scripts/smoke_api.py --base-url http://127.0.0.1:3001 --no-websocket
```

Both scripts print endpoint timing and task lifecycle transitions so you can confirm behavior without opening the dashboard.

## Deepgram Voice Agent Settings

Live calls use Deepgram when these are enabled:

- `DEEPGRAM_VOICE_AGENT_ENABLED=true` (or `false` to use legacy/no live LLM bridge)
- `DEEPGRAM_VOICE_AGENT_WS_URL` (defaults to `wss://agent.deepgram.com/v1/agent/converse`)
- `DEEPGRAM_VOICE_AGENT_LISTEN_MODEL` (`nova-3`)
- `DEEPGRAM_VOICE_AGENT_SPEAK_MODEL` (`aura-2-thalia-en`)
- `DEEPGRAM_VOICE_AGENT_THINK_PROVIDER` (`openai` | `anthropic` | `google` | `groq`)
- `DEEPGRAM_VOICE_AGENT_THINK_MODEL` (for example `gpt-4o-mini`)
- `DEEPGRAM_VOICE_AGENT_THINK_TEMPERATURE` (float, optional)
- `DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL` (optional provider-specific endpoint)
- `DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_HEADERS` (optional JSON headers string)

The `DEEPGRAM_API_KEY` must be set when the voice pipeline is enabled.

## Logging controls

- `LOG_LEVEL=INFO|DEBUG|WARNING|ERROR`
- `LOG_NOISY_EVENTS_EVERY_N=120`

`LOG_NOISY_EVENTS_EVERY_N` samples very frequent events (`media_event`, `save_audio_chunk`, `media_mark_received`) to keep logs readable.
