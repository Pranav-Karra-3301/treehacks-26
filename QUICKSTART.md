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

```bash
docker-compose up --build
```

Note: container-based env variables are set directly in services; for advanced env use the `*-app` shell or compose env files.

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
```

## 7) Sanity checks

- Backend health: `curl http://localhost:3001/health`
- Create task: `POST http://localhost:3001/api/tasks`
- Start call: `POST http://localhost:3001/api/tasks/<task_id>/call`
