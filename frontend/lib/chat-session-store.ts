import type { ChatSessionMode } from './types';

export const CHAT_SESSION_SCHEMA_VERSION = 2;

export type PersistedSessionPayload = Record<string, unknown>;

export type PersistedChatSessionEnvelope<T extends PersistedSessionPayload = PersistedSessionPayload> = {
  schema_version: number;
  session_id: string;
  mode: ChatSessionMode;
  revision: number;
  run_id?: string | null;
  task_ids: string[];
  updated_at: string;
  data: T;
};

// All local persistence has been removed. The backend is the sole source of truth.

export function readLocalSessionById<T extends PersistedSessionPayload = PersistedSessionPayload>(
  _sessionId: string,
): PersistedChatSessionEnvelope<T> | null {
  return null;
}

export function readLatestLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(
  _mode?: ChatSessionMode,
): PersistedChatSessionEnvelope<T> | null {
  return null;
}

export function readActiveLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(
  _mode?: ChatSessionMode,
): PersistedChatSessionEnvelope<T> | null {
  return null;
}

export function writeLocalSessionWithAttempts<T extends PersistedSessionPayload = PersistedSessionPayload>(
  attempts: PersistedChatSessionEnvelope<T>[],
): { ok: boolean; saved: PersistedChatSessionEnvelope<T> | null } {
  return { ok: true, saved: attempts[0] ?? null };
}

export function removeLocalSession(_sessionId: string, _mode?: ChatSessionMode): void {}

export function removeLocalSessionsByTaskId(_taskId: string): void {}

export function clearLocalSessionMode(_mode: ChatSessionMode): void {}
