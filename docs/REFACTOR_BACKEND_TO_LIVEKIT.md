# Long-Minded Plan: Refactor Backend to LiveKit (Codex-Assisted)

This document is a full refactor plan to move kiru's voice/call path from the current **Twilio Media Stream + Deepgram/custom orchestrator** stack to **LiveKit (Cloud or self-hosted) + LiveKit Agents**, while keeping the FastAPI app for REST, storage, and dashboard WebSocket. It is written so that each phase can be executed incrementally with an AI assistant (e.g. Codex/Cursor) via clear, scoped prompts.

**References (implementer):**
- [LiveKit Agents telephony](https://docs.livekit.io/agents/v0/voice-agent/telephony) — inbound/outbound, dispatch, SIP
- [Outbound caller example (Python)](https://github.com/livekit-examples/outbound-caller-python)
- [Voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai/)

---

## 1. Current Architecture (Summary)

### 1.1 Call and voice flow

- **Task creation**: `POST /api/tasks` → `DataStore.create_task(task_id, payload)`.
- **Start call**: `POST /api/tasks/{id}/call` → `CallOrchestrator.start_task_call()`:
  - Creates a `CallSession` (session_id) and maps `task_id → session_id`.
  - Sets status to `dialing`, then `active`.
  - **Twilio**: `TwilioClient.place_call(target_phone, task_id)` → outbound call; Twilio hits `/twilio/voice` with TwiML that `<Connect><Stream url=".../twilio/media-stream?task_id=...">`.
  - Backend accepts a **single long-lived WebSocket** at `/twilio/media-stream`; Twilio sends `start` (with streamSid, callSid, optional task_id), then `media` (base64 μ-law) and `mark` events.
  - Orchestrator: `register_media_stream(task_id, websocket)`, `set_media_stream_sid` / `set_media_call_sid`; resolves task from query param, streamSid, or callSid.
  - **Voice path A (Deepgram Voice Agent)**  
    If `DEEPGRAM_VOICE_AGENT_ENABLED`: orchestrator starts `DeepgramVoiceAgentSession` with callbacks that:
    - Append turns to transcript and persist.
    - Save agent audio chunks and send them back to Twilio via the same media WebSocket (`_send_agent_audio_to_twilio`).
    - Stream “thinking” to dashboard WS.
  - **Voice path B (legacy)**: Orchestrator could use a different pipeline (e.g. STT → LLM → TTS) and still send agent audio over the Twilio media WebSocket; current code is centered on Deepgram path.
- **Real-time dashboard**: Frontend connects to `GET /ws/call/{identifier}` where `identifier` is task_id or session_id; `ConnectionManager` broadcasts by **task_id** (topic). Events: `call_status`, transcript turns, agent thinking, etc.
- **Stop call**: `POST /api/tasks/{id}/stop` → `stop_task_call` (end Twilio call, clear media WS, stop Deepgram session). Twilio status callback also triggers stop.
- **Persistence**: `DataStore` (SQLite) for task metadata; `data/{task_id}/` for transcript, conversation, analysis, WAVs. Orchestrator appends turns, saves audio chunks, runs post-call analysis.

### 1.2 Key backend surface

| Component | Role |
|----------|------|
| `app/main.py` | Creates FastAPI app, injects `DataStore`, `SessionManager`, `ConnectionManager`, `CallOrchestrator`, `CacheService`; mounts task, ws, twilio, telemetry, research, system, llm_proxy, chat_sessions routes. |
| `app/routes/tasks.py` | Task CRUD, `/{id}/call`, `/{id}/stop`, `/{id}/transfer`, `/{id}/dtmf`, transcript, analysis, audio download. |
| `app/routes/twilio.py` | `POST /twilio/voice` (TwiML), `WS /twilio/media-stream` (Twilio media protocol). |
| `app/routes/ws.py` | `WS /ws/call/{identifier}` — resolve identifier to task_id, subscribe to topic. |
| `app/services/orchestrator.py` | task_id ↔ session_id ↔ media WS ↔ stream_sid/call_sid; start/stop/transfer/dtmf; Deepgram session lifecycle; transcript/audio persistence; broadcast to dashboard. |
| `app/services/deepgram_voice_agent.py` | Single WebSocket to Deepgram; STT/LLM/TTS; callbacks for conversation, agent audio, thinking, tools (e.g. research, DTMF). |
| `app/services/twilio_client.py` | place_call, end_call, transfer_call, send_dtmf (TwiML update). |
| `app/services/ws_manager.py` | ConnectionManager: connect/disconnect by topic (task_id), broadcast. |
| `app/services/storage.py` | DataStore: SQLite + filesystem per task_id. |
| `app/services/session_manager.py` | In-memory CallSession (status, transcript, etc.). |
| `app/services/negotiation_engine.py` | Prompt building, LLM streaming, summarization (used by Deepgram “think” config and/or legacy path). |

Everything that is **not** “receive Twilio media, run voice pipeline, send agent audio back to Twilio” can stay in FastAPI: task CRUD, storage, analysis, dashboard WebSocket, research, chat sessions, LLM proxy, telemetry.

---

## 2. Target Architecture: LiveKit

### 2.1 Roles of each system

- **LiveKit (Cloud or self-hosted)**  
  - Provides **rooms** and **participants**.  
  - A **SIP participant** (or TwiML bridge) brings the **phone leg** into a room; no more custom Twilio Media Stream WebSocket in your backend.  
  - A **LiveKit Voice Agent** (Python process) joins the same room as a participant, receives/sends audio via LiveKit’s real-time layer.

- **Twilio (or another SIP provider)**  
  - Still used for **PSTN**: buy numbers, place/answer calls.  
  - For **inbound**: Twilio (or LiveKit Phone Numbers) routes the call into LiveKit (SIP trunk or TwiML to LiveKit’s SIP endpoint).  
  - For **outbound**: Your backend asks LiveKit to create an outbound SIP participant (LiveKit calls Twilio/SIP provider to dial the number); the phone user joins a LiveKit room. So you no longer call `TwilioClient.place_call()` from the orchestrator; you trigger a **LiveKit Agent dispatch** with metadata (e.g. `task_id`, `target_phone`), and the agent (or a separate “outbound” service) creates the SIP participant via LiveKit API.

- **FastAPI (kiru backend)**  
  - **Remains** the HTTP API and source of truth for **tasks**: create task, list, get, start/stop “call” (see below), transfer, DTMF, transcript, analysis, audio download.  
  - **Remains** the dashboard WebSocket: `WS /ws/call/{identifier}` so the frontend still subscribes by task_id/session_id and gets the same event shapes (call_status, transcript, thinking, etc.).  
  - **Stops** accepting Twilio media: no `/twilio/media-stream` WebSocket; optionally keep `/twilio/voice` only if you use TwiML-based redirect to LiveKit (otherwise SIP trunk replaces it).  
  - **New**: “Start call” becomes “create LiveKit room (or use room name from task_id) + dispatch LiveKit Agent with job metadata (task_id, target_phone, task payload)”. “Stop call” becomes “end agent job + delete room” (and/or SIP hangup via LiveKit).

- **LiveKit Agent (separate process)**  
  - One **worker process** (or many) running `livekit-agents` with an **entrypoint** that:  
    - Receives a **Job** (room name, metadata).  
    - If metadata contains `target_phone`, creates an **outbound SIP participant** so the phone user joins the room.  
    - Connects to the room, starts an **AgentSession** (STT → LLM → TTS).  
    - Uses **tools** for: research, DTMF, “end call”, etc.  
    - Pushes **transcript and events** back to your backend (or to a LiveKit webhook/egress) so the FastAPI app can persist and broadcast to the dashboard.

### 2.2 Data flow (target)

1. **Dashboard / API**  
   - User creates task via `POST /api/tasks`.  
   - User starts call via `POST /api/tasks/{id}/call`.  
   - FastAPI: ensure task exists, then call **LiveKit API** to create a dispatch (room name e.g. `call-{task_id}`, agent name e.g. `kiru-voice-agent`, metadata = `{"task_id": "...", "target_phone": "+1...", ...}`). No Twilio `place_call` here.  
   - Frontend already subscribes to `WS /ws/call/{task_id}`; backend must still broadcast `call_status`, transcript, thinking. So the **agent** must send these events to the backend (e.g. over HTTP or a small WebSocket from agent → backend, or LiveKit webhooks/egress).

2. **LiveKit**  
   - Dispatches job to an agent worker.  
   - Agent worker creates outbound SIP participant (if metadata has `target_phone`), then joins room.  
   - Phone user is in the same room as the agent. Audio flows: phone ↔ LiveKit ↔ agent (no Twilio media stream in your code).

3. **Agent → Backend**  
   - Agent has **task_id** in job metadata. For each turn, “thinking” span, or status change, agent calls your **FastAPI** (e.g. `POST /api/internal/agent-events` or a dedicated WebSocket). FastAPI updates storage and broadcasts to dashboard WS so the UI stays unchanged.  
   - Alternatively, use LiveKit **egress** (e.g. room composite) and/or **webhooks** (participant joined/left) and infer status in the backend; transcript/thinking still need a dedicated channel from agent to backend.

4. **Stop / transfer / DTMF**  
   - **Stop**: Frontend `POST /api/tasks/{id}/stop` → FastAPI calls LiveKit API to delete room (and/or disconnect SIP participant). No direct Twilio `end_call` from orchestrator; LiveKit cleans up the room and the SIP leg.  
   - **Transfer**: Use LiveKit’s **TransferSIPParticipant** (or equivalent) from the agent (as a tool) or from the backend via LiveKit API if exposed.  
   - **DTMF**: LiveKit telephony supports DTMF; agent can send/receive via tools or track; backend can still expose `POST /api/tasks/{id}/dtmf` and forward to LiveKit API if LiveKit provides a “send DTMF” API for a SIP participant.

### 2.3 What gets removed, what stays

| Current | After refactor |
|--------|-----------------|
| `POST /twilio/voice` (TwiML) | Optional: keep only if using TwiML → LiveKit. Otherwise remove; SIP trunk handles inbound. |
| `WS /twilio/media-stream` | **Remove.** Replaced by LiveKit room + SIP participant. |
| `TwilioClient.place_call` | **Remove** from “start call” path. Replace with LiveKit dispatch + agent creates SIP participant. |
| `TwilioClient.end_call` | **Remove.** Replace with LiveKit “delete room” or disconnect SIP participant. |
| `TwilioClient.transfer_call` | Replace with LiveKit TransferSIPParticipant (from agent or API). |
| `TwilioClient.send_dtmf` | Replace with LiveKit DTMF if available from API; else agent handles. |
| Orchestrator’s media WS registry, stream_sid/call_sid maps | **Remove.** No Twilio media stream. |
| `DeepgramVoiceAgentSession` (current) | **Remove** from FastAPI process. Logic moves into LiveKit Agent (STT/LLM/TTS can still be Deepgram, or use LiveKit’s plugins). |
| Orchestrator’s `_send_agent_audio_to_twilio`, `on_media_chunk`, `register_media_stream`, etc. | **Remove.** Agent sends audio inside LiveKit. |
| `SessionManager` / `CallSession` | **Keep** for dashboard and API: e.g. “session_id” can be LiveKit room name or an internal id; task_id remains primary for REST and WS topic. |
| `DataStore`, task CRUD, transcript/analysis persistence | **Keep.** Unchanged. |
| `ConnectionManager` (dashboard WS) | **Keep.** Agent (or a sidecar) pushes events to FastAPI; FastAPI broadcasts to `/ws/call/{task_id}`. |
| `NegotiationEngine`, `LLMClient`, prompt builder | **Reuse** inside the LiveKit Agent (same prompts/LLM), or keep in FastAPI and agent calls FastAPI for “get next reply” (heavier coupling). Prefer moving prompt/LLM into agent for simplicity. |

---

## 3. Phased Migration (Codex-Friendly)

Each phase is a **single, committable scope** you can hand to an AI assistant: “Implement phase N as in REFACTOR_BACKEND_TO_LIVEKIT.md.”

### Phase 0: Prep (no behavior change)

- **0.1** Add LiveKit dependencies: `livekit-api`, `livekit-agents` (and any plugins: STT/TTS/LLM you plan to use) in a new `backend/agents/` (or `backend/livekit_agent/`) directory; keep FastAPI deps in `backend/requirements.txt`. Optionally a separate `backend/agents/requirements.txt` for the agent process.  
- **0.2** Add config: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME` (e.g. `kiru-voice-agent`), and for outbound: `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` (or equivalent). Document in `backend/.env.example`.  
- **0.3** Create a minimal **agent entrypoint** that only connects to a room and logs (no SIP, no real voice yet). Run it with `uv run agent.py dev` against a test room to confirm LiveKit connectivity.  
- **Deliverable**: Agent process runs and connects; FastAPI unchanged; no Twilio media removal yet.

### Phase 1: LiveKit outbound call (parallel path)

- **1.1** Implement **outbound** in the agent: in entrypoint, read `ctx.job.metadata` (e.g. `task_id`, `target_phone`). If `target_phone` is present, call `ctx.api.sip.create_sip_participant(...)` (room_name = e.g. `call-{task_id}`, sip_trunk_id, sip_call_to = target_phone, wait_until_answered=True). Then start `AgentSession` (STT/LLM/TTS). Use explicit agent name (e.g. `@server.rtc_session(agent_name="kiru-voice-agent")`) and dispatch rule so this agent is only used when explicitly dispatched.  
- **1.2** In FastAPI, add a **feature flag** (e.g. `USE_LIVEKIT_FOR_CALLS=true`). When starting a call (`POST /api/tasks/{id}/call`):  
  - If flag off: keep current behavior (Twilio place_call + media stream).  
  - If flag on: do **not** call Twilio; instead call LiveKit API to create dispatch (room name `call-{task_id}`, agent name, metadata = task_id + target_phone + minimal task payload). Create a **session** in `SessionManager` and map task_id → session_id (session_id can be room name). Set status to `dialing` then to `active` after a short delay or after first agent event (see below).  
- **1.3** Agent → backend link: from the agent, on connect or first “greeting”, send an HTTP POST to FastAPI (e.g. `POST /api/internal/agent-events`) with task_id, event type (e.g. `call_connected`), and optional payload. FastAPI updates status, broadcasts to dashboard WS. So dashboard still shows “active” and receives events.  
- **1.4** Implement **stop**: when `USE_LIVEKIT_FOR_CALLS` and user hits “Stop”, FastAPI calls LiveKit API to delete room (and optionally disconnect SIP participant). No Twilio `end_call`.  
- **Deliverable**: With flag on, “start call” uses LiveKit + agent; phone is bridged via SIP; “stop” uses LiveKit. With flag off, old Twilio path still works. Dashboard receives status/events via existing WS.

### Phase 2: Agent content and persistence

- **2.1** In the agent, load **negotiation context** from task metadata (or fetch from FastAPI `GET /api/tasks/{task_id}`) and configure the LLM (system prompt, style, walkaway, etc.) using your existing `prompt_builder` / `NegotiationEngine` logic. Either copy that logic into the agent repo or have the agent call FastAPI to get “next reply” (simpler to copy and keep agent self-contained).  
- **2.2** On each **user turn** and **agent turn**, agent sends a structured event to FastAPI (e.g. `transcript_turn` with speaker, text, timestamp). FastAPI appends to transcript, persists to `data/{task_id}/transcript.json`, and broadcasts to dashboard WS so the live transcript UI keeps working.  
- **2.3** Stream “agent thinking” to FastAPI; FastAPI broadcasts to dashboard (same event shape as today).  
- **2.4** On **call end** (room closed or participant left), agent sends `call_ended`; FastAPI sets status to `ended`, updates `ended_at`, and runs existing post-call analysis (if any). Optionally agent sends a final “transcript complete” payload so backend can merge any last turns.  
- **Deliverable**: One full outbound call with LiveKit produces the same transcript and dashboard behavior as today, with analysis and storage.

### Phase 3: Transfer, DTMF, and parity

- **3.1** **Transfer**: Implement a **tool** in the agent (e.g. `transfer_call(phone_number)`) that calls LiveKit’s `transfer_sip_participant` (or equivalent). Expose `POST /api/tasks/{id}/transfer` in FastAPI; when called, either (a) send a “transfer” command to the agent via a side-channel (e.g. LiveKit data message or backend-held WebSocket from agent to backend), or (b) have the backend call LiveKit API for transfer if available. Prefer (b) if LiveKit allows transferring by room + participant identity.  
- **3.2** **DTMF**: If LiveKit supports sending DTMF to a SIP participant via API, implement `POST /api/tasks/{id}/dtmf` by calling that API. Otherwise implement a tool in the agent that sends DTMF and have the backend “request” DTMF via agent (e.g. metadata or data message).  
- **3.3** **Recording**: If you need inbound/outbound WAVs, use LiveKit egress (room composite or track) to record; or have the agent send raw audio segments to FastAPI for persistence (heavier). Prefer egress for production.  
- **Deliverable**: Transfer and DTMF work; recording strategy decided and implemented at least for one path.

### Phase 4: Remove Twilio media path and cleanup

- **4.1** Remove **Twilio media** from FastAPI: delete `/twilio/media-stream` WebSocket handler; remove orchestrator’s media WS registry, `_send_agent_audio_to_twilio`, `on_media_chunk`, stream_sid/call_sid maps, and Deepgram session lifecycle from the orchestrator. Keep `TwilioClient` only if you still use Twilio for something (e.g. TwiML redirect for inbound); otherwise remove or stub.  
- **4.2** Make LiveKit the **default**: set `USE_LIVEKIT_FOR_CALLS=true` by default; remove or hide the flag after soak.  
- **4.3** Remove **Deepgram Voice Agent** usage from FastAPI (delete or archive `deepgram_voice_agent.py` usage from orchestrator; keep file for reference if needed).  
- **4.4** Inbound: if you need inbound calls, add SIP trunk (or TwiML) so inbound calls create a room and dispatch the same agent; agent entrypoint can branch on “no target_phone in metadata” to do greeting-first (inbound) vs wait-for-user (outbound).  
- **Deliverable**: Single voice path (LiveKit); no Twilio media; cleaner orchestrator and routes.

### Phase 5: Observability and hardening

- **5.1** Telemetry: ensure all “start call”, “stop call”, “transfer”, “dtmf”, and “agent event” paths log to your existing `timed_step` / `log_event` and that LiveKit room/job ids are included where useful.  
- **5.2** Errors: map LiveKit API errors to HTTP and to dashboard (e.g. “call failed” with reason).  
- **5.3** Tests: add integration tests that (with mocks or test LiveKit project) dispatch the agent and assert backend state and optional WebSocket events.  
- **Deliverable**: Production-ready observability and tests; docs updated.

---

## 4. API Contract Preservation (Frontend)

- **REST**: Keep `POST/GET /api/tasks`, `POST /api/tasks/{id}/call`, `POST /api/tasks/{id}/stop`, `POST /api/tasks/{id}/transfer`, `POST /api/tasks/{id}/dtmf`, transcript, analysis, audio download. Request/response shapes unchanged.  
- **WebSocket**: Keep `WS /ws/call/{identifier}` with same topic resolution (task_id). Keep event types and payload shapes: `call_status`, transcript turns, agent thinking, etc. Only the **source** of those events changes (agent → FastAPI → broadcast instead of orchestrator → broadcast).  
- **Session vs task**: Frontend can keep using task_id for subscribe; backend can still return a `session_id` (e.g. room name) in responses and in WS events so the UI does not need to change.

---

## 5. Using Codex (or Any AI Assistant) for the Refactor

- **Per-phase prompts**: For each phase, paste the phase description and the “Deliverable” from this doc, plus the relevant file paths (e.g. `backend/app/services/orchestrator.py`, `backend/app/routes/tasks.py`, `backend/agents/agent.py`). Ask the model to implement only that phase and to run tests/lint.  
- **Smaller steps**: If a phase is too large, split it (e.g. “Phase 1.1 only: add agent entrypoint with outbound SIP and AgentSession; no FastAPI changes”).  
- **Tests**: After each phase, run `./scripts/run-tests.sh`, `pytest -q -m integration`, and any agent-side tests; fix regressions before moving on.  
- **Commits**: One commit per phase (or per sub-step) with a clear message referencing this refactor plan.  
- **Rollback**: Keep the feature flag until Phase 4; rollback = set `USE_LIVEKIT_FOR_CALLS=false` and redeploy. After Phase 4, rollback requires re-adding the Twilio media path from git history or a branch.

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| LiveKit Cloud/SIP cost or limits | Start with a test project; document cost; consider self-hosted LiveKit if needed. |
| Agent and FastAPI disagree on task state | Use task_id as single source of truth; agent sends all mutations to FastAPI; avoid agent persisting directly to DB. |
| Latency or reliability of “agent → FastAPI” events | Use a single HTTP endpoint with retries; optional queue (e.g. Redis) if you need durability. |
| Twilio status callback no longer used for hangup | Rely on LiveKit room-deleted or participant-left; optionally register a webhook from LiveKit to FastAPI for “room ended” and sync status. |
| Recording parity | Plan egress or agent-side upload early so you don’t lose recording capability after removing Twilio media. |

---

## 7. Summary

- **Goal**: Move voice/call handling from Twilio Media Stream + in-process Deepgram/orchestrator to **LiveKit rooms + LiveKit Voice Agent**, with **FastAPI** remaining the REST and dashboard WebSocket backend and source of truth for tasks.  
- **Twilio**: No longer used for media streaming; still used (or replaced by another SIP provider) for the PSTN leg, which LiveKit bridges into a room via SIP.  
- **Refactor**: Add LiveKit + agent in phases (prep → parallel LiveKit path → content/persistence → transfer/DTMF/recording → remove Twilio media → observability). Use a feature flag and same API/WS contract so the frontend stays unchanged.  
- **Codex**: Use this doc as the single “long-minded” spec; run each phase as a scoped task with tests and commits; rollback via flag until Phase 4.
