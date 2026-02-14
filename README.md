# NegotiateAI MVP (Scaffold)

Locally-powered voice negotiation agent project skeleton for a TreeHacks-style demo.

## Structure

- `backend/`: FastAPI orchestrator, REST+WebSocket API, storage/session service stubs.
- `frontend/`: Next.js dashboard with routes:
  - ` / ` - create a task and start a call.
  - `/call/[id]` - live call monitor + transcript stream.
  - `/history` - call list.
  - `/history/[id]` - call detail + analysis.

## Quick Start

1. Backend
   - `cd backend`
   - `python -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `uvicorn app.main:app --reload --port 3001`

2. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev`

3. Configure `.env`
   - Copy `backend/.env.example` to `backend/.env` and fill optional API keys.

## Notes

- The backend currently includes placeholder implementations for:
  - Twilio call initiation/webhook handling
  - Deepgram STT/TTS streams
  - Interruption/barge-in
  - Advanced post-call analysis
- These files are intentionally isolated by service (`app/services/*`) so you can replace implementations quickly.
