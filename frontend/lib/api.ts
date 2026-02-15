import { BACKEND_API_URL, BACKEND_WS_URL } from './config';

/** Safely extract an error message from a FastAPI error body.
 *  `detail` may be a string (HTTPException) or an array of objects (validation error). */
function extractDetail(body: Record<string, unknown>, fallback: string): string {
  const d = body.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    const msgs = d.map((e) => (typeof e === 'object' && e !== null && 'msg' in e ? (e as { msg: string }).msg : JSON.stringify(e)));
    return msgs.join('; ');
  }
  return fallback;
}

import type {
  TaskDetail,
  TaskSummary,
  CallEvent,
  AnalysisPayload,
  ActionResponse,
  VoiceReadiness,
  ResearchResponse,
  RecordingMetadata,
  TelemetryRecentResponse,
  TelemetrySummaryResponse,
  TranscriptResponse,
  TelemetryEventsPayload,
  CallRecordingMetadata,
  CallRecordingFiles,
  TaskTranscriptPayload,
  MultiCallSummaryResponse,
  ChatSessionMode,
  ChatSessionRecord,
} from './types';

export async function createTask(payload: unknown): Promise<TaskSummary> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
  return res.json();
}

export async function upsertChatSession(payload: {
  session_id: string;
  mode: ChatSessionMode;
  revision: number;
  run_id?: string | null;
  task_ids: string[];
  data: Record<string, unknown>;
}): Promise<ChatSessionRecord> {
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to upsert chat session: ${res.status}`);
  return res.json();
}

export async function getChatSessionLatest(mode?: ChatSessionMode): Promise<ChatSessionRecord> {
  const query = mode ? `?mode=${mode}` : '';
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions/latest${query}`);
  if (!res.ok) throw new Error(`Failed to load latest chat session: ${res.status}`);
  return res.json();
}

export async function getChatSessionById(sessionId: string): Promise<ChatSessionRecord> {
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to load chat session: ${res.status}`);
  return res.json();
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(extractDetail(body, `Failed to delete chat session: ${res.status}`));
  }
}

export async function deleteTask(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: extractDetail(body, `Failed to delete task: ${res.status}`), session_id: null };
  }
  return res.json();
}

export async function listTasks(): Promise<TaskSummary[]> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks`);
  if (!res.ok) throw new Error(`Failed to list tasks: ${res.status}`);
  return res.json();
}

export async function getTask(id: string): Promise<TaskDetail> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}`);
  if (!res.ok) throw new Error(`Failed to load task: ${res.status}`);
  return res.json();
}

export async function startCall(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/call`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: extractDetail(body, `Failed to start call: ${res.status}`), session_id: null };
  }
  return res.json();
}

export async function stopCall(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: extractDetail(body, `Failed to stop call: ${res.status}`), session_id: null };
  }
  return res.json();
}

export async function transferCall(id: string, toPhone: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_phone: toPhone }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: extractDetail(body, `Failed to transfer call: ${res.status}`), session_id: null };
  }
  return res.json();
}

export async function sendCallDtmf(id: string, digits: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/dtmf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ digits }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: extractDetail(body, `Failed to send keypad digits: ${res.status}`), session_id: null };
  }
  return res.json();
}

export async function getTaskAnalysis(id: string): Promise<AnalysisPayload> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/analysis`);
  if (!res.ok) throw new Error(`Failed to load analysis: ${res.status}`);
  return res.json();
}

export async function checkVoiceReadiness(): Promise<VoiceReadiness> {
  const res = await fetch(`${BACKEND_API_URL}/api/system/voice-readiness`);
  if (!res.ok) throw new Error(`Failed to check readiness: ${res.status}`);
  return res.json();
}

export async function searchResearch(query: string, limit?: number): Promise<ResearchResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...(limit != null && { limit }) }),
  });
  if (!res.ok) throw new Error(`Research failed: ${res.status}`);
  return res.json();
}

export function getAudioUrl(taskId: string, side: 'mixed' | 'inbound' | 'outbound' = 'mixed'): string {
  return `${BACKEND_API_URL}/api/tasks/${taskId}/audio?side=${side}`;
}

export async function getRecordingMetadata(taskId: string): Promise<RecordingMetadata> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${taskId}/recording-metadata`);
  if (!res.ok) throw new Error(`Failed to get recording metadata: ${res.status}`);
  return res.json();
}

export async function getTaskRecordingMetadata(id: string): Promise<CallRecordingMetadata> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/recording-metadata`);
  if (!res.ok) throw new Error(`Failed to load recording metadata: ${res.status}`);
  return res.json();
}

export async function getTaskRecordingFiles(id: string): Promise<CallRecordingFiles> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/recording-files`);
  if (!res.ok) throw new Error(`Failed to load recording files: ${res.status}`);
  return res.json();
}

export async function getTaskTranscript(id: string): Promise<TranscriptResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/transcript`);
  if (!res.ok) throw new Error(`Failed to load transcript: ${res.status}`);
  return res.json();
}

export async function getMultiCallSummary(taskIds: string[], objective = ''): Promise<MultiCallSummaryResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/multi-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_ids: taskIds, taskIds, objective }),
  });
  if (!res.ok) throw new Error(`Failed to load multi-call summary: ${res.status}`);
  return res.json();
}

export async function fetchTelemetryRecent(limit = 50): Promise<TelemetryRecentResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/telemetry/recent?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch telemetry: ${res.status}`);
  return res.json();
}

export async function fetchTelemetrySummary(): Promise<TelemetrySummaryResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/telemetry/summary`);
  if (!res.ok) throw new Error(`Failed to fetch telemetry summary: ${res.status}`);
  return res.json();
}

export async function getRecentTelemetry(params: {
  limit?: number;
  component?: string;
  action?: string;
  task_id?: string;
  session_id?: string;
}): Promise<TelemetryEventsPayload> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.component) query.set('component', params.component);
  if (params.action) query.set('action', params.action);
  if (params.task_id) query.set('task_id', params.task_id);
  if (params.session_id) query.set('session_id', params.session_id);

  const res = await fetch(`${BACKEND_API_URL}/api/telemetry/recent?${query.toString()}`);
  if (!res.ok) throw new Error(`Failed to load telemetry: ${res.status}`);
  return res.json();
}

export function createCallSocket(identifier: string, onEvent: (event: CallEvent) => void): WebSocket {
  const socket = new WebSocket(`${BACKEND_WS_URL}/ws/call/${identifier}`);
  socket.onmessage = (event) => {
    try {
      const parsed: CallEvent = JSON.parse(event.data);
      onEvent(parsed);
    } catch {
      // ignore malformed packets
    }
  };
  return socket;
}
