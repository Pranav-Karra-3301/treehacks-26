import { BACKEND_API_URL, BACKEND_WS_URL } from './config';
import type { TaskDetail, TaskSummary, CallEvent } from './types';

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

export async function startCall(id: string): Promise<{ session_id?: string }> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/call`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to start call: ${res.status}`);
  return res.json();
}

export async function stopCall(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop call: ${res.status}`);
}

export async function getTaskAnalysis(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BACKEND_API_URL}/api/tasks/${id}/analysis`);
  if (!res.ok) throw new Error(`Failed to load analysis: ${res.status}`);
  return res.json();
}

export function createCallSocket(taskId: string, onEvent: (event: CallEvent) => void): WebSocket {
  const socket = new WebSocket(`${BACKEND_WS_URL}/ws/call/${taskId}`);
  socket.onmessage = (event) => {
    try {
      const parsed: CallEvent = JSON.parse(event.data);
      onEvent(parsed);
    } catch {
      // ignore malformed packets in early MVP
    }
  };
  return socket;
}
