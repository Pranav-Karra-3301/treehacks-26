# Backend (FastAPI)

## Run

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3001
```

## LLM Provider Configuration

Set the following in `backend/.env`:

- `LLM_PROVIDER=openai` to use OpenAI API.
- `LLM_PROVIDER=anthropic` to use Claude API.
- `LLM_PROVIDER=local` to use DGX/vLLM (OpenAI-compatible endpoint).

OpenAI and Claude values are pulled from:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_BASE_URL`

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
