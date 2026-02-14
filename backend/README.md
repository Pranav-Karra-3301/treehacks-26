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
- `LLM_PROVIDER=local` for DGX/vLLM

Required keys per provider:

- OpenAI: `OPENAI_API_KEY`
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
