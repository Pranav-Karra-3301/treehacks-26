import { BACKEND_API_URL, BACKEND_WS_URL } from './config';
import type {
  TaskDetail,
  TaskSummary,
  CallEvent,
  AnalysisPayload,
  ActionResponse,
  VoiceReadiness,
  ResearchResponse,
  TranscriptResponse,
  ChatSessionMode,
  ChatSessionRecord,
} from './types';

const API_HEADERS: Record<string, string> = {};

export async function createTask(payload: unknown): Promise<TaskSummary> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
  return res.json();
}

export async function listTasks(): Promise<TaskSummary[]> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to list tasks: ${res.status}`);
  return res.json();
}

export async function getTask(id: string): Promise<TaskDetail> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to load task: ${res.status}`);
  return res.json();
}

export async function startCall(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/call`, {
    method: 'POST',
    headers: API_HEADERS,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.detail ?? `Failed to start call: ${res.status}`, session_id: null };
  }
  return res.json();
}

export async function stopCall(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/stop`, {
    method: 'POST',
    headers: API_HEADERS,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.detail ?? `Failed to stop call: ${res.status}`, session_id: null };
  }
  return res.json();
}

export async function transferCall(id: string, toPhone: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify({ to_phone: toPhone }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.detail ?? `Failed to transfer call: ${res.status}`, session_id: null };
  }
  return res.json();
}

export async function sendCallDtmf(id: string, digits: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/dtmf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify({ digits }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ')
        : `Failed to send keypad digits: ${res.status}`;
    return { ok: false, message, session_id: null };
  }
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
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to upsert chat session: ${res.status}`);
  return res.json();
}

export async function getChatSessionLatest(mode?: ChatSessionMode): Promise<ChatSessionRecord> {
  const query = mode ? `?mode=${mode}` : '';
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions/latest${query}`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to load latest chat session: ${res.status}`);
  return res.json();
}

export async function getChatSessionById(sessionId: string): Promise<ChatSessionRecord> {
  const res = await fetch(`${BACKEND_API_URL}/api/chat-sessions/${sessionId}`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to load chat session: ${res.status}`);
  return res.json();
}

export async function getTaskAnalysis(id: string): Promise<AnalysisPayload> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/analysis`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to load analysis: ${res.status}`);
  return res.json();
}

export async function checkVoiceReadiness(): Promise<VoiceReadiness> {
  const res = await fetch(`${BACKEND_API_URL}/api/system/voice-readiness`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to check readiness: ${res.status}`);
  return res.json();
}

export async function searchResearch(query: string, limit?: number): Promise<ResearchResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    body: JSON.stringify({ query, ...(limit != null && { limit }) }),
  });
  if (!res.ok) throw new Error(`Research failed: ${res.status}`);
  return res.json();
}

export function getAudioUrl(taskId: string, side: 'mixed' | 'inbound' | 'outbound' = 'mixed'): string {
  return `${BACKEND_API_URL}/api/tasks/${taskId}/audio?side=${side}`;
}

export async function getTaskTranscript(id: string): Promise<TranscriptResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/transcript`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Failed to load transcript: ${res.status}`);
  return res.json();
}

export function createCallSocket(sessionId: string, onEvent: (event: CallEvent) => void): WebSocket {
  const socket = new WebSocket(`${BACKEND_WS_URL}/ws/call/${sessionId}`);
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
