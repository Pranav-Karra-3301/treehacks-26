import AsyncStorage from '@react-native-async-storage/async-storage';
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

const STORAGE_PREFIX = 'kiru_chat_session_v2';
const ACTIVE_SESSION_KEY = 'kiru_chat_active_session_v2';

function sessionKey(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readActiveLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(): Promise<PersistedChatSessionEnvelope<T> | null> {
  try {
    const pointerRaw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    const pointer = safeParseJson<{ session_id: string }>(pointerRaw);
    if (!pointer?.session_id) return null;

    const sessionRaw = await AsyncStorage.getItem(sessionKey(pointer.session_id));
    const session = safeParseJson<PersistedChatSessionEnvelope<T>>(sessionRaw);
    if (session && session.session_id) return session;
    return null;
  } catch {
    return null;
  }
}

export async function writeLocalSession<T extends PersistedSessionPayload = PersistedSessionPayload>(
  envelope: PersistedChatSessionEnvelope<T>,
): Promise<boolean> {
  try {
    await AsyncStorage.setItem(sessionKey(envelope.session_id), JSON.stringify(envelope));
    await AsyncStorage.setItem(
      ACTIVE_SESSION_KEY,
      JSON.stringify({ session_id: envelope.session_id, mode: envelope.mode, updated_at: envelope.updated_at }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeLocalSession(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(sessionKey(sessionId));
    const pointerRaw = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
    const pointer = safeParseJson<{ session_id: string }>(pointerRaw);
    if (pointer?.session_id === sessionId) {
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch {
    // ignore cleanup failures
  }
}
