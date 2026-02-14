# Repository Guidelines

## Project Structure & Module Organization
This repo is a two-service app.

- `backend/` — FastAPI orchestrator and orchestration logic.
  - `backend/app/main.py` wires the app and middleware.
  - `backend/app/core/` contains configuration and telemetry helpers.
  - `backend/app/services/` contains business logic (LLM, audio, Twilio, sessions).
  - `backend/app/routes/` contains API/websocket/twilio endpoints.
  - `backend/app/models/` contains request/response schemas.
- `frontend/` — Next.js dashboard.
  - `frontend/app/` holds route pages.
  - `frontend/components/` reusable UI pieces.
  - `frontend/lib/` shared helpers.
  - `frontend/public/` static assets.
- `backend/data/` and `backend/data/*.db` are runtime artifacts (ignore in VCS).
- Environment templates: `.env.example`, `backend/.env.example`, `frontend/.env.example`.

## Build, Test, and Development Commands
- `cd backend && python -m venv .venv && source .venv/bin/activate` — create Python env.
- `cd backend && pip install -r requirements.txt` — install backend deps.
- `cd backend && uvicorn app.main:app --reload --port 3001` — run API locally.
- `cd frontend && npm install` — install dashboard deps.
- `cd frontend && npm run dev` — run dashboard at `http://localhost:3000`.
- `cd frontend && npm run build` — production build sanity check.
- `cd frontend && npm run lint` — run frontend linting.
- `docker-compose up --build` — start both services together.
- `cd backend && ./scripts/run-tests.sh` — run backend test suite and grouped targets (`unit`, `integration`, `ws`, `benchmark`).
- `cd backend && pytest -q -m unit` — fast unit regression set.
- `cd backend && pytest -q -m integration` — API/integration tests with mocked providers.
- `cd backend && pytest -q -m ws` — websocket lifecycle tests.
- `cd backend && pytest -q -m benchmark` — timing sanity checks.
- `cd backend && python scripts/smoke_api.py --base-url http://127.0.0.1:3001` — one-shot API + websocket smoke flow.
- `cd backend && python scripts/smoke_api.py --base-url http://127.0.0.1:3001 --no-websocket` — REST-only smoke path.

## Coding Style & Naming Conventions
- Python: follow existing style (`snake_case` for funcs/vars, `CamelCase` classes, 4-space indent, type hints where practical).
- TypeScript/React: existing files use `strict: true`, single-quoted imports, and component file names in `kebab-case` under `components/`.
- Keep route names and environment variables explicit and stable; prefer clear names like `task_routes`, `session_manager`.
- Do not commit secrets; environment values live in `.env` files only.

## Testing Guidelines
- Backend test dependency is present (`pytest` in `backend/requirements.txt`).
- Default workflow for backend behavior checks while building:
  - Backend: `cd backend && ./scripts/run-tests.sh`
  - Focused checks while iterating:
    - `pytest -q -m unit`
    - `pytest -q -m integration`
    - `pytest -q -m ws`
    - `pytest -q -m benchmark`
  - Endpoint smoke test (no UI): `python scripts/smoke_api.py --base-url http://127.0.0.1:3001`
  - Use `--no-websocket` when WS endpoint is not available.
- Frontend: `cd frontend && npm run lint` and `npm run build` as minimum quality gates.
- Place new tests under `backend/tests/` and `frontend/__tests__/` (or equivalent) and include naming like `test_*.py` / `*.test.tsx`.

## Commit & Pull Request Guidelines
- Existing commits use short imperative titles (`Add ...`, `Initial ...`). Follow the same style.
- Use focused commits: one logical change per commit.
- PRs should include:
  - summary of behavior changes,
  - commands run (`uvicorn`, `npm run dev`, `pytest`, `npm run lint`, `npm run build`),
  - any env/config notes,
  - screenshots for UI changes and curl examples for API changes.

## Security & Configuration Tips
- Never commit API keys, phone secrets, or `.env` files.
- Verify `.gitignore` coverage for `.venv/`, `node_modules/`, `.next/`, and `backend/data/`.
- Redact PII before sharing logs from `backend/data/service.log`.
