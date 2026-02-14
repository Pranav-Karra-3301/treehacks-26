# Backend (FastAPI)

## Run

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3001
```

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
