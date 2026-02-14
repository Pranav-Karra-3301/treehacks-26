import { BACKEND_API_URL, BACKEND_WS_URL } from './config';
import type { TaskDetail, TaskSummary, CallEvent, AnalysisPayload, ActionResponse, VoiceReadiness, ResearchResponse, RecordingMetadata, TelemetryRecentResponse, TelemetrySummaryResponse, TranscriptResponse } from './types';

export async function createTask(payload: unknown): Promise<TaskSummary> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
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
    return { ok: false, message: body.detail ?? `Failed to start call: ${res.status}`, session_id: null };
  }
  return res.json();
}

export async function stopCall(id: string): Promise<ActionResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.detail ?? `Failed to stop call: ${res.status}`, session_id: null };
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

export async function getTaskTranscript(id: string): Promise<TranscriptResponse> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/transcript`);
  if (!res.ok) throw new Error(`Failed to load transcript: ${res.status}`);
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
