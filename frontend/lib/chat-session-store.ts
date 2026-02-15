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

type ChatSessionIndexEntry = {
  session_id: string;
  mode: ChatSessionMode;
  revision: number;
  run_id?: string | null;
  task_ids: string[];
  updated_at: string;
};

type ActiveSessionPointer = {
  session_id: string;
  mode: ChatSessionMode;
  updated_at: string;
};

const INDEX_LIMIT = 30;
const STORAGE_PREFIX = 'kiru_chat_session_v2';
const ACTIVE_SESSION_KEY = 'kiru_chat_active_session_v2';
const INDEX_KEY_BY_MODE: Record<ChatSessionMode, string> = {
  single: 'kiru_chat_index_single_v2',
  concurrent: 'kiru_chat_index_concurrent_v2',
};

function sessionKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

function backupKey(sessionId: string): string {
  return `${sessionKey(sessionId)}:backup`;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readIndex(mode: ChatSessionMode): ChatSessionIndexEntry[] {
  const parsed = safeParseJson<ChatSessionIndexEntry[]>(window.localStorage.getItem(INDEX_KEY_BY_MODE[mode]));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry) => Boolean(entry?.session_id && entry?.updated_at))
    .slice(0, INDEX_LIMIT);
}

function writeIndex(mode: ChatSessionMode, entries: ChatSessionIndexEntry[]): void {
  window.localStorage.setItem(INDEX_KEY_BY_MODE[mode], JSON.stringify(entries.slice(0, INDEX_LIMIT)));
}

function toIndexEntry<T extends PersistedSessionPayload>(session: PersistedChatSessionEnvelope<T>): ChatSessionIndexEntry {
  return {
    session_id: session.session_id,
    mode: session.mode,
    revision: session.revision,
    run_id: session.run_id ?? null,
    task_ids: session.task_ids ?? [],
    updated_at: session.updated_at,
  };
}

function readActivePointer(): ActiveSessionPointer | null {
  const parsed = safeParseJson<ActiveSessionPointer>(window.localStorage.getItem(ACTIVE_SESSION_KEY));
  if (!parsed?.session_id) return null;
  if (parsed.mode !== 'single' && parsed.mode !== 'concurrent') return null;
  return parsed;
}

function writeActivePointer<T extends PersistedSessionPayload>(session: PersistedChatSessionEnvelope<T>): void {
  const pointer: ActiveSessionPointer = {
    session_id: session.session_id,
    mode: session.mode,
    updated_at: session.updated_at,
  };
  window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(pointer));
}

function updateModeIndex<T extends PersistedSessionPayload>(session: PersistedChatSessionEnvelope<T>): void {
  const current = readIndex(session.mode);
  const withoutDup = current.filter((entry) => entry.session_id !== session.session_id);
  const next = [toIndexEntry(session), ...withoutDup].slice(0, INDEX_LIMIT);
  writeIndex(session.mode, next);
}

export function readLocalSessionById<T extends PersistedSessionPayload = PersistedSessionPayload>(
  sessionId: string,
): PersistedChatSessionEnvelope<T> | null {
  const primary = safeParseJson<PersistedChatSessionEnvelope<T>>(window.localStorage.getItem(sessionKey(sessionId)));
  if (primary && primary.session_id) return primary;
  const backup = safeParseJson<PersistedChatSessionEnvelope<T>>(window.localStorage.getItem(backupKey(sessionId)));
  if (backup && backup.session_id) return backup;
  return null;
}

export function readLatestLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(
  mode?: ChatSessionMode,
): PersistedChatSessionEnvelope<T> | null {
  const modes: ChatSessionMode[] = mode ? [mode] : ['single', 'concurrent'];
  const candidates: ChatSessionIndexEntry[] = [];
  modes.forEach((m) => {
    const entries = readIndex(m);
    candidates.push(...entries);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  for (const candidate of candidates) {
    const resolved = readLocalSessionById<T>(candidate.session_id);
    if (resolved) return resolved;
  }
  return null;
}

export function readActiveLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(
  mode?: ChatSessionMode,
): PersistedChatSessionEnvelope<T> | null {
  const active = readActivePointer();
  if (active && (!mode || active.mode === mode)) {
    const resolved = readLocalSessionById<T>(active.session_id);
    if (resolved) return resolved;
  }
  return readLatestLocalSession<T>(mode);
}

export function writeLocalSessionWithAttempts<T extends PersistedSessionPayload = PersistedSessionPayload>(
  attempts: PersistedChatSessionEnvelope<T>[],
): { ok: boolean; saved: PersistedChatSessionEnvelope<T> | null } {
  for (const attempt of attempts) {
    try {
      window.localStorage.setItem(sessionKey(attempt.session_id), JSON.stringify(attempt));
      const backup = attempts[attempts.length - 1] ?? attempt;
      window.localStorage.setItem(backupKey(attempt.session_id), JSON.stringify(backup));
      updateModeIndex(attempt);
      writeActivePointer(attempt);
      return { ok: true, saved: attempt };
    } catch {
      try {
        window.localStorage.removeItem(sessionKey(attempt.session_id));
      } catch {
        // ignore cleanup failures
      }
    }
  }
  return { ok: false, saved: null };
}

export function removeLocalSession(sessionId: string, mode?: ChatSessionMode): void {
  window.localStorage.removeItem(sessionKey(sessionId));
  window.localStorage.removeItem(backupKey(sessionId));
  const active = readActivePointer();
  if (active?.session_id === sessionId) {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
  const modes: ChatSessionMode[] = mode ? [mode] : ['single', 'concurrent'];
  modes.forEach((m) => {
    const next = readIndex(m).filter((entry) => entry.session_id !== sessionId);
    writeIndex(m, next);
  });
}

export function clearLocalSessionMode(mode: ChatSessionMode): void {
  const entries = readIndex(mode);
  entries.forEach((entry) => {
    window.localStorage.removeItem(sessionKey(entry.session_id));
    window.localStorage.removeItem(backupKey(entry.session_id));
  });
  window.localStorage.removeItem(INDEX_KEY_BY_MODE[mode]);
  const active = readActivePointer();
  if (active?.mode === mode) {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}
