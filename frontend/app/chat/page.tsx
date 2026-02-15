'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowLeft, Phone, RotateCcw, AlertTriangle, Plus, PanelLeftClose, PanelLeft, BarChart3, X } from 'lucide-react';
import { createTask, startCall, stopCall, transferCall, sendCallDtmf, createCallSocket, checkVoiceReadiness, searchResearch, getTaskAnalysis, getTaskTranscript, getTask, listTasks, getMultiCallSummary, getChatSessionById, getChatSessionLatest, upsertChatSession } from '../../lib/api';
import { readActiveLocalSession, writeLocalSessionWithAttempts, type PersistedChatSessionEnvelope } from '../../lib/chat-session-store';
import type { CallEvent, CallStatus, AnalysisPayload, TaskSummary, CallOutcome, BusinessResult, VoiceReadiness, MultiCallSummaryPayload, ChatSessionMode, ChatSessionRecord } from '../../lib/types';
import AnalysisCard from '../../components/analysis-card';
import AudioPlayer from '../../components/audio-player';
import SearchResultCards from '../../components/search-result-cards';

type Message = {
  id: string;
  role: 'user' | 'ai' | 'status' | 'analysis' | 'audio' | 'search-results';
  text: string;
  analysisData?: AnalysisPayload;
  audioTaskId?: string;
  searchResults?: BusinessResult[];
};

type ConversationPhase = 'objective' | 'discovery' | 'phone' | 'connecting' | 'active' | 'ended';
type ConcurrentMode = 'test' | 'real';
type MultiCallEventStatus = CallStatus | 'connected' | 'disconnected' | 'media_connected' | 'mark';
type MultiCallTranscriptEntry = {
  id: string;
  role: 'agent' | 'caller' | 'status';
  text: string;
};
type MultiCallState = {
  taskId: string;
  sessionId: string | null;
  status: MultiCallEventStatus;
  transcript: MultiCallTranscriptEntry[];
  thinking: boolean;
  analysis: AnalysisPayload | null;
  analysisState: 'idle' | 'loading' | 'ready' | 'error';
  analysisError: string | null;
};
type MultiCallTargetMeta = {
  phone: string;
  source: 'manual' | 'exa';
  title: string | null;
  url: string | null;
  snippet: string | null;
};
type MultiCallHistoryEntry = {
  id: string;
  objective: string;
  createdAt: string;
  mode?: ConcurrentMode;
  calls: Array<{ phone: string; taskId: string }>;
};
type MultiSummaryState = 'idle' | 'loading' | 'ready' | 'error';
type ChatSnapshot = {
  messages: Message[];
  input: string;
  phase: ConversationPhase;
  objective: string;
  phoneNumber: string;
  taskId: string | null;
  sessionId: string | null;
  callStatus: CallStatus;
  readinessWarning: string | null;
  researchContext: string;
  analysisLoaded: boolean;
  sidebarOpen: boolean;
  discoveryResults: BusinessResult[];
  manualPhones: string[];
  manualPhoneInput: string;
  concurrentTestMode: boolean;
  concurrentRunMode?: ConcurrentMode;
  concurrentTargetCount: number;
  autoSourceNumbers: boolean;
  multiCallTargets: Record<string, MultiCallTargetMeta>;
  multiCalls: Record<string, MultiCallState>;
  multiHistory: MultiCallHistoryEntry[];
  activeMultiHistoryId: string | null;
  userLocation: string | null;
  multiSummary: MultiCallSummaryPayload | null;
  multiSummaryState: MultiSummaryState;
  multiSummaryError: string | null;
  personalHandoffNumber: string;
  singleDtmfInput: string;
  multiDtmfInputs: Record<string, string>;
};
type PersistedSessionData = {
  snapshot: ChatSnapshot;
};

const ease = [0.16, 1, 0.3, 1] as const;
const MAX_CONCURRENT_TEST_CALLS = 4;
const PHONE_CANDIDATE_RE = /(?:\+?1[\s().-]*)?(?:\(\s*[2-9]\d{2}\s*\)|[2-9]\d{2})[\s().-]*[2-9]\d{2}[\s.-]*\d{4}(?:\s*(?:#|x|ext\.?|extension)\s*\d{1,6})?/gi;
const UNICODE_DASH_RE = /[‐‑‒–—―]/g;
const PHONE_EXTENSION_RE = /(?:#|x|ext\.?|extension)\s*\d{1,6}$/i;
const MULTI_HISTORY_STORAGE_KEY = 'kiru_multi_call_history_v1';
const CHAT_SNAPSHOT_STORAGE_KEY = 'kiru_chat_snapshot_v1';
const CHAT_SNAPSHOT_FALLBACK_STORAGE_KEY = 'kiru_chat_snapshot_v1_backup';
const SNAPSHOT_MAX_MESSAGES = 120;
const SNAPSHOT_MAX_TEXT = 1800;
const SNAPSHOT_MAX_MULTI_TRANSCRIPT = 120;
const SNAPSHOT_MAX_SEARCH_RESULTS = 24;
const SNAPSHOT_PERSIST_DEBOUNCE_MS = 350;
const MULTI_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  dialing: 'Dialing',
  connected: 'Connected',
  media_connected: 'Media connected',
  active: 'Active',
  disconnected: 'Disconnected',
  ended: 'Ended',
  failed: 'Failed',
  mark: 'Marker',
};
type DiscoveredPhoneTarget = {
  phone: string;
  title: string | null;
  url: string | null;
  snippet: string | null;
};

function clampConcurrentCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CONCURRENT_TEST_CALLS, Math.max(1, Math.round(value)));
}

function buildReadinessWarning(readiness: VoiceReadiness): string | null {
  if (readiness.can_dial_live) return null;
  const issues: string[] = [];
  if (!readiness.twilio_configured) issues.push('Twilio is not configured.');
  if (readiness.twilio_webhook_reason) issues.push(readiness.twilio_webhook_reason);
  else if (readiness.twilio_webhook_public === false) issues.push('TWILIO_WEBHOOK_HOST must be a public HTTPS URL.');
  if (!readiness.deepgram_configured) issues.push('Deepgram is not configured.');
  if (!readiness.llm_ready) issues.push('OpenAI is not configured.');
  if (!readiness.deepgram_voice_agent_enabled) issues.push('Voice agent is disabled.');
  return issues.length > 0
    ? Array.from(new Set(issues)).join(' ')
    : 'Voice system is not ready for live calling.';
}

function normalizePhoneText(text: string): string {
  // NFKC turns full-width digits/symbols into ASCII forms so copied numbers parse reliably.
  return text.normalize('NFKC').replace(UNICODE_DASH_RE, '-');
}

function normalizePhone(raw: string): string | null {
  const candidate = normalizePhoneText(raw).replace(PHONE_EXTENSION_RE, '');
  const digits = candidate.replace(/\D/g, '');
  const core = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits.length === 10
      ? digits
      : null;
  if (!core) return null;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(core)) return null;
  return `+1${core}`;
}

function parsePhonesFromText(text: string): string[] {
  const matches = normalizePhoneText(text).match(PHONE_CANDIDATE_RE) || [];
  const normalized = matches
    .map(normalizePhone)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized));
}

function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  const digits = normalized.slice(2);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function extractConcurrentCountFromText(text: string): number | null {
  const normalized = text.toLowerCase();
  const direct = normalized.match(/\b(\d{1,2})\b(?=[^\n]{0,24}\b(?:concurrent|simultaneous|agents?|calls?|numbers?|users?)\b)/i);
  if (direct?.[1]) return clampConcurrentCount(Number.parseInt(direct[1], 10));

  const reverse = normalized.match(/\b(?:concurrent|simultaneous)\s*(?:voice\s*)?(?:agents?|calls?|numbers?|users?)?\s*(?:of|x|=)?\s*(\d{1,2})\b/i);
  if (reverse?.[1]) return clampConcurrentCount(Number.parseInt(reverse[1], 10));
  return null;
}

function collectTargetsFromResearch(results: BusinessResult[], maxCount: number): DiscoveredPhoneTarget[] {
  const discovered: DiscoveredPhoneTarget[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const textBlock = [
      result.title ?? '',
      result.snippet ?? '',
      ...(result.highlights ?? []),
    ].join('\n');
    const candidates = [...(result.phone_numbers ?? []), ...parsePhonesFromText(textBlock)];
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      discovered.push({
        phone: normalized,
        title: result.title ?? null,
        url: result.url ?? null,
        snippet: result.snippet ?? null,
      });
      if (discovered.length >= maxCount) return discovered;
    }
  }
  return discovered;
}

function compactText(text: string, max = SNAPSHOT_MAX_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeDtmfInput(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '')
    .toUpperCase()
    .trim();
}

function compactBusinessResult(result: BusinessResult): BusinessResult {
  return {
    ...result,
    title: result.title ? compactText(result.title, 180) : result.title,
    snippet: result.snippet ? compactText(result.snippet, 320) : result.snippet,
    highlights: (result.highlights ?? []).slice(0, 4).map((h) => compactText(h, 200)),
  };
}

function compactAnalysis(analysis: AnalysisPayload | null): AnalysisPayload | null {
  if (!analysis) return null;
  return {
    ...analysis,
    summary: compactText(analysis.summary || '', 2200),
    outcome_reasoning: compactText(analysis.outcome_reasoning || '', 1200),
    score_reasoning: compactText(analysis.score_reasoning || '', 1200),
    key_moments: (analysis.key_moments ?? []).slice(0, 20).map((item) => compactText(item, 260)),
    improvement_suggestions: (analysis.improvement_suggestions ?? []).slice(0, 20).map((item) => compactText(item, 260)),
    details: {},
  };
}

function compactMessage(message: Message): Message {
  return {
    ...message,
    text: compactText(message.text || ''),
    analysisData: message.analysisData ? compactAnalysis(message.analysisData) ?? undefined : undefined,
    searchResults: message.searchResults
      ? message.searchResults.slice(0, SNAPSHOT_MAX_SEARCH_RESULTS).map(compactBusinessResult)
      : undefined,
  };
}

function compactMultiSummary(summary: MultiCallSummaryPayload | null): MultiCallSummaryPayload | null {
  if (!summary) return null;
  return {
    ...summary,
    overall_summary: compactText(summary.overall_summary || '', 2600),
    recommended_option: compactText(summary.recommended_option || '', 1200),
    decision_rationale: compactText(summary.decision_rationale || '', 1800),
    price_comparison: (summary.price_comparison ?? []).slice(0, 20).map((row) => ({
      ...row,
      quoted_prices: (row.quoted_prices ?? []).slice(0, 12).map((item) => compactText(item, 160)),
      discounts: (row.discounts ?? []).slice(0, 12).map((item) => compactText(item, 160)),
      fees: (row.fees ?? []).slice(0, 12).map((item) => compactText(item, 160)),
      constraints: (row.constraints ?? []).slice(0, 12).map((item) => compactText(item, 180)),
      key_takeaways: (row.key_takeaways ?? []).slice(0, 12).map((item) => compactText(item, 200)),
    })),
    important_facts: (summary.important_facts ?? []).slice(0, 30).map((item) => compactText(item, 240)),
    missing_information: (summary.missing_information ?? []).slice(0, 30).map((item) => compactText(item, 240)),
    next_best_actions: (summary.next_best_actions ?? []).slice(0, 30).map((item) => compactText(item, 240)),
  };
}

function downgradeSnapshot(snapshot: ChatSnapshot, level: 1 | 2 | 3): ChatSnapshot {
  if (level === 1) {
    return {
      ...snapshot,
      messages: snapshot.messages.slice(-80).map((msg) => ({
        ...msg,
        text: compactText(msg.text || '', 1000),
        analysisData: msg.analysisData ? compactAnalysis(msg.analysisData) ?? undefined : undefined,
        searchResults: msg.searchResults ? msg.searchResults.slice(0, 8).map(compactBusinessResult) : undefined,
      })),
      discoveryResults: snapshot.discoveryResults.slice(0, 12).map(compactBusinessResult),
      multiCalls: Object.fromEntries(
        Object.entries(snapshot.multiCalls).map(([phone, state]) => [
          phone,
          {
            ...state,
            transcript: state.transcript
              .slice(-60)
              .map((entry) => ({ ...entry, text: compactText(entry.text || '', 260) })),
            analysis: compactAnalysis(state.analysis),
            analysisError: state.analysisError ? compactText(state.analysisError, 200) : null,
          },
        ]),
      ),
      multiHistory: snapshot.multiHistory.slice(0, 20),
      multiSummary: compactMultiSummary(snapshot.multiSummary),
      researchContext: compactText(snapshot.researchContext || '', 3000),
    };
  }

  if (level === 2) {
    return {
      ...snapshot,
      messages: snapshot.messages.slice(-35).map((msg) => ({
        ...msg,
        text: compactText(msg.text || '', 600),
        analysisData: undefined,
        searchResults: undefined,
      })),
      discoveryResults: [],
      multiCalls: {},
      multiSummary: null,
      multiSummaryState: 'idle',
      multiSummaryError: null,
      multiHistory: snapshot.multiHistory.slice(0, 15),
      researchContext: compactText(snapshot.researchContext || '', 1400),
    };
  }

  return {
    ...snapshot,
    messages: snapshot.messages.slice(-12).map((msg) => ({
      id: msg.id,
      role: msg.role,
      text: compactText(msg.text || '', 400),
    })),
    discoveryResults: [],
    multiCalls: {},
    multiHistory: snapshot.multiHistory.slice(0, 10),
    multiSummary: null,
    multiSummaryState: 'idle',
    multiSummaryError: null,
    researchContext: compactText(snapshot.researchContext || '', 900),
    analysisLoaded: false,
  };
}

function createEmergencyPersistenceSnapshot(snapshot: ChatSnapshot): ChatSnapshot {
  return {
    messages: snapshot.messages.slice(-12).map((message) => ({
      ...message,
      text: compactText(message.text || '', 220),
      analysisData: undefined,
      searchResults: undefined,
    })),
    input: snapshot.input,
    phase: snapshot.phase,
    objective: compactText(snapshot.objective || '', 500),
    phoneNumber: snapshot.phoneNumber,
    taskId: snapshot.taskId,
    sessionId: snapshot.sessionId,
    callStatus: snapshot.callStatus,
    readinessWarning: snapshot.readinessWarning ? compactText(snapshot.readinessWarning, 140) : null,
    researchContext: compactText(snapshot.researchContext || '', 1200),
    analysisLoaded: false,
    sidebarOpen: snapshot.sidebarOpen,
    discoveryResults: snapshot.discoveryResults.slice(0, 6).map(compactBusinessResult),
    manualPhones: snapshot.manualPhones.slice(0, 25),
    manualPhoneInput: '',
    concurrentTestMode: snapshot.concurrentTestMode,
    concurrentRunMode: snapshot.concurrentRunMode,
    concurrentTargetCount: snapshot.concurrentTargetCount,
    autoSourceNumbers: snapshot.autoSourceNumbers,
    multiCallTargets: Object.fromEntries(
      Object.entries(snapshot.multiCallTargets).slice(0, 12).map(([phone, target]) => [
        phone,
        {
          ...target,
          title: target.title ? compactText(target.title, 120) : null,
          url: target.url ? compactText(target.url, 220) : null,
          snippet: target.snippet ? compactText(target.snippet, 260) : null,
        },
      ]),
    ),
    multiCalls: Object.fromEntries(
      Object.entries(snapshot.multiCalls).map(([phone, state]) => [
        phone,
        {
          taskId: state.taskId,
          sessionId: state.sessionId,
          status: state.status,
          transcript: state.transcript
            .slice(-6)
            .map((entry) => ({ ...entry, text: compactText(entry.text || '', 120) })),
          thinking: false,
          analysis: null,
          analysisState: state.analysisState,
          analysisError: state.analysisError ? compactText(state.analysisError, 140) : null,
        },
      ]),
    ),
    multiHistory: snapshot.multiHistory.slice(0, 6),
    activeMultiHistoryId: snapshot.activeMultiHistoryId,
    userLocation: snapshot.userLocation,
    multiSummary: null,
    multiSummaryState: snapshot.multiSummaryState === 'ready' || snapshot.multiSummaryState === 'error'
      ? snapshot.multiSummaryState
      : 'idle',
    multiSummaryError: snapshot.multiSummaryError ? compactText(snapshot.multiSummaryError, 140) : null,
    personalHandoffNumber: snapshot.personalHandoffNumber ? compactText(snapshot.personalHandoffNumber, 22) : '',
    singleDtmfInput: snapshot.singleDtmfInput,
    multiDtmfInputs: Object.fromEntries(
      Object.entries(snapshot.multiDtmfInputs).slice(0, 12).map(([phone, digits]) => [phone, compactText(digits, 80)]),
    ),
  };
}

function makeChatSessionId(prefix = 'chat'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildServerSyncEnvelope(snapshot: ChatSnapshot, sessionId: string, revision: number): PersistedChatSessionEnvelope<PersistedSessionData> {
  return toServerSyncEnvelope(buildSessionEnvelope(downgradeSnapshot(snapshot, 1), sessionId, revision));
}

function resolveSnapshotMode(snapshot: ChatSnapshot): ChatSessionMode {
  if (snapshot.concurrentTestMode || Object.keys(snapshot.multiCalls ?? {}).length > 0) {
    return 'concurrent';
  }
  return 'single';
}

function collectSnapshotTaskIds(snapshot: ChatSnapshot): string[] {
  const ids = new Set<string>();
  if (snapshot.taskId) ids.add(snapshot.taskId);
  Object.values(snapshot.multiCalls ?? {}).forEach((call) => {
    if (call.taskId) ids.add(call.taskId);
  });
  return Array.from(ids);
}

function buildSessionEnvelope(
  snapshot: ChatSnapshot,
  sessionId: string,
  revision: number,
): PersistedChatSessionEnvelope<PersistedSessionData> {
  return {
    schema_version: 2,
    session_id: sessionId,
    mode: resolveSnapshotMode(snapshot),
    revision,
    run_id: snapshot.activeMultiHistoryId ?? undefined,
    task_ids: collectSnapshotTaskIds(snapshot),
    updated_at: new Date().toISOString(),
    data: { snapshot },
  };
}

function persistSnapshotToLocalStorage(
  snapshot: ChatSnapshot,
  sessionId: string,
  revision: number,
): PersistedChatSessionEnvelope<PersistedSessionData> | null {
  const attempts: Array<PersistedChatSessionEnvelope<PersistedSessionData>> = [
    buildSessionEnvelope(snapshot, sessionId, revision),
    buildSessionEnvelope(downgradeSnapshot(snapshot, 1), sessionId, revision),
    buildSessionEnvelope(downgradeSnapshot(snapshot, 2), sessionId, revision),
    buildSessionEnvelope(downgradeSnapshot(snapshot, 3), sessionId, revision),
    buildSessionEnvelope(createEmergencyPersistenceSnapshot(snapshot), sessionId, revision),
  ];
  const writeResult = writeLocalSessionWithAttempts(attempts);
  if (!writeResult.ok || !writeResult.saved) return null;
  try {
    window.localStorage.setItem(MULTI_HISTORY_STORAGE_KEY, JSON.stringify(writeResult.saved.data.snapshot.multiHistory ?? []));
  } catch {
    // ignore auxiliary history persistence errors
  }
  return writeResult.saved;
}

function toServerSyncEnvelope(
  envelope: PersistedChatSessionEnvelope<PersistedSessionData>,
): PersistedChatSessionEnvelope<PersistedSessionData> {
  const snapshot = envelope.data?.snapshot;
  if (!snapshot) return envelope;
  return {
    ...envelope,
    data: { snapshot: downgradeSnapshot(snapshot, 1) },
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      text: 'What would you like me to negotiate?',
    },
  ]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ConversationPhase>('objective');
  const [typing, setTyping] = useState(false);
  const [objective, setObjective] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('pending');
  const [readinessWarning, setReadinessWarning] = useState<string | null>(null);
  const [researchContext, setResearchContext] = useState('');
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pastTasks, setPastTasks] = useState<TaskSummary[]>([]);
  const [discoveryResults, setDiscoveryResults] = useState<BusinessResult[]>([]);
  const [manualPhones, setManualPhones] = useState<string[]>([]);
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [concurrentTestMode, setConcurrentTestMode] = useState(false);
  const [concurrentRunMode, setConcurrentRunMode] = useState<ConcurrentMode>('test');
  const [concurrentTargetCount, setConcurrentTargetCount] = useState(3);
  const [autoSourceNumbers, setAutoSourceNumbers] = useState(true);
  const [multiCallTargets, setMultiCallTargets] = useState<Record<string, MultiCallTargetMeta>>({});
  const [multiCalls, setMultiCalls] = useState<Record<string, MultiCallState>>({});
  const [multiHistory, setMultiHistory] = useState<MultiCallHistoryEntry[]>([]);
  const [activeMultiHistoryId, setActiveMultiHistoryId] = useState<string | null>(null);
  const [multiSummary, setMultiSummary] = useState<MultiCallSummaryPayload | null>(null);
  const [multiSummaryState, setMultiSummaryState] = useState<MultiSummaryState>('idle');
  const [multiSummaryError, setMultiSummaryError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [personalHandoffNumber, setPersonalHandoffNumber] = useState('');
  const [singleDtmfInput, setSingleDtmfInput] = useState('');
  const [multiDtmfInputs, setMultiDtmfInputs] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const multiSocketRef = useRef<Record<string, WebSocket>>({});
  const multiCallsRef = useRef<Record<string, MultiCallState>>({});
  const multiEndedAnnouncedRef = useRef(false);
  const analysisLoadedRef = useRef(false);
  const hasLoadedSnapshotRef = useRef(false);
  const activeSummaryRequestRef = useRef<string | null>(null);
  const snapshotRef = useRef<ChatSnapshot | null>(null);
  const chatSessionIdRef = useRef<string>(makeChatSessionId());
  const chatSessionRevisionRef = useRef<number>(0);
  const pendingServerSyncRef = useRef<PersistedChatSessionEnvelope<PersistedSessionData> | null>(null);
  const serverSyncTimerRef = useRef<number | null>(null);
  const serverSyncInFlightRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }

  function closeAllSockets() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    Object.values(multiSocketRef.current).forEach((socket) => socket.close());
    multiSocketRef.current = {};
  }

  function resetChatSessionIdentity(prefix = 'chat') {
    chatSessionIdRef.current = makeChatSessionId(prefix);
    chatSessionRevisionRef.current = 0;
    snapshotRef.current = null;
    pendingServerSyncRef.current = null;
    serverSyncInFlightRef.current = false;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (serverSyncTimerRef.current !== null) {
      window.clearTimeout(serverSyncTimerRef.current);
      serverSyncTimerRef.current = null;
    }
  }

  const flushChatSessionSync = useCallback(async () => {
    if (serverSyncInFlightRef.current) return;
    const envelope = pendingServerSyncRef.current;
    if (!envelope) return;
    const payloadEnvelope = toServerSyncEnvelope(envelope);
    serverSyncInFlightRef.current = true;
    try {
      await upsertChatSession({
        session_id: payloadEnvelope.session_id,
        mode: payloadEnvelope.mode,
        revision: payloadEnvelope.revision,
        run_id: payloadEnvelope.run_id ?? null,
        task_ids: payloadEnvelope.task_ids,
        data: payloadEnvelope.data,
      });
      if (pendingServerSyncRef.current?.revision === envelope.revision) {
        pendingServerSyncRef.current = null;
      }
    } catch {
      // best-effort; local cache remains primary fast path
    } finally {
      serverSyncInFlightRef.current = false;
      if (pendingServerSyncRef.current) {
        serverSyncTimerRef.current = window.setTimeout(() => {
          void flushChatSessionSync();
        }, 1200);
      } else {
        serverSyncTimerRef.current = null;
      }
    }
  }, []);

  const queueChatSessionSync = useCallback((envelope: PersistedChatSessionEnvelope<PersistedSessionData>, immediate = false) => {
    pendingServerSyncRef.current = envelope;
    if (serverSyncTimerRef.current !== null) {
      window.clearTimeout(serverSyncTimerRef.current);
      serverSyncTimerRef.current = null;
    }
    if (immediate) {
      void flushChatSessionSync();
      return;
    }
    serverSyncTimerRef.current = window.setTimeout(() => {
      void flushChatSessionSync();
    }, 700);
  }, [flushChatSessionSync]);

  const applySnapshotState = useCallback((snapshot: ChatSnapshot) => {
    setMessages(snapshot.messages);
    setInput(snapshot.input ?? '');
    setPhase(snapshot.phase ?? 'objective');
    setObjective(snapshot.objective ?? '');
    setPhoneNumber(snapshot.phoneNumber ?? '');
    setTaskId(snapshot.taskId ?? null);
    setSessionId(snapshot.sessionId ?? null);
    setCallStatus(snapshot.callStatus ?? 'pending');
    setReadinessWarning(snapshot.readinessWarning ?? null);
    setResearchContext(snapshot.researchContext ?? '');
    setAnalysisLoaded(Boolean(snapshot.analysisLoaded));
    analysisLoadedRef.current = Boolean(snapshot.analysisLoaded);
    setSidebarOpen(snapshot.sidebarOpen ?? true);
    setDiscoveryResults(snapshot.discoveryResults ?? []);
    setManualPhones(snapshot.manualPhones ?? []);
    setManualPhoneInput(snapshot.manualPhoneInput ?? '');
    setConcurrentTestMode(false);
    setConcurrentRunMode(snapshot.concurrentRunMode === 'real' ? 'real' : 'test');
    setConcurrentTargetCount(clampConcurrentCount(snapshot.concurrentTargetCount ?? 3));
    setAutoSourceNumbers(snapshot.autoSourceNumbers ?? true);
    setMultiCallTargets(snapshot.multiCallTargets ?? {});
    setMultiCalls(snapshot.multiCalls ?? {});
    multiCallsRef.current = snapshot.multiCalls ?? {};
    setMultiHistory(snapshot.multiHistory ?? []);
    setActiveMultiHistoryId(snapshot.activeMultiHistoryId ?? null);
    setUserLocation(snapshot.userLocation ?? null);
    setMultiSummary(snapshot.multiSummary ?? null);
    const restoredSummaryState: MultiSummaryState =
      snapshot.multiSummaryState === 'loading'
      || snapshot.multiSummaryState === 'ready'
      || snapshot.multiSummaryState === 'error'
      || snapshot.multiSummaryState === 'idle'
        ? snapshot.multiSummaryState
        : 'idle';
    setMultiSummaryState(restoredSummaryState);
    setMultiSummaryError(snapshot.multiSummaryError ?? null);
    setPersonalHandoffNumber(snapshot.personalHandoffNumber ?? '');
    setSingleDtmfInput(snapshot.singleDtmfInput ?? '');
    setMultiDtmfInputs(snapshot.multiDtmfInputs ?? {});
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [phase]);

  // Fetch past tasks on mount
  const refreshPastTasks = useCallback(() => {
    listTasks().then(setPastTasks).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPastTasks();
  }, [refreshPastTasks]);

  // Restore last chat snapshot (local fast path + server rehydrate)
  useEffect(() => {
    let cancelled = false;

    const applyEnvelope = (envelope: PersistedChatSessionEnvelope<PersistedSessionData> | null): boolean => {
      if (!envelope) return false;
      const snapshot = envelope.data?.snapshot;
      if (!snapshot || !Array.isArray(snapshot.messages)) return false;
      applySnapshotState(snapshot);
      chatSessionIdRef.current = envelope.session_id;
      chatSessionRevisionRef.current = Math.max(0, Number(envelope.revision || 0));
      snapshotRef.current = snapshot;
      return true;
    };

    const toEnvelope = (record: ChatSessionRecord): PersistedChatSessionEnvelope<PersistedSessionData> | null => {
      const data = (record.data ?? {}) as PersistedSessionData;
      if (!data || typeof data !== 'object') return null;
      const snapshot = data.snapshot;
      if (!snapshot || !Array.isArray(snapshot.messages)) return null;
      return {
        schema_version: 2,
        session_id: record.session_id,
        mode: record.mode,
        revision: record.revision,
        run_id: record.run_id ?? undefined,
        task_ids: record.task_ids ?? [],
        updated_at: record.updated_at,
        data: { snapshot },
      };
    };

    const restore = async () => {
      let restoredFromLocal = false;
      let localEnvelope: PersistedChatSessionEnvelope<PersistedSessionData> | null = null;
      try {
        localEnvelope = readActiveLocalSession<PersistedSessionData>();
        if (applyEnvelope(localEnvelope)) {
          restoredFromLocal = true;
        }

        // Legacy fallback for existing v1 keys while users transition.
        if (!restoredFromLocal) {
          const snapshotKeys = [CHAT_SNAPSHOT_STORAGE_KEY, CHAT_SNAPSHOT_FALLBACK_STORAGE_KEY];
          for (const key of snapshotKeys) {
            const snapshotRaw = window.localStorage.getItem(key);
            if (!snapshotRaw) continue;
            try {
              const snapshot = JSON.parse(snapshotRaw) as ChatSnapshot;
              if (snapshot && Array.isArray(snapshot.messages)) {
                applySnapshotState(snapshot);
                snapshotRef.current = snapshot;
                chatSessionIdRef.current = makeChatSessionId('legacy');
                chatSessionRevisionRef.current = 0;
                restoredFromLocal = true;
                break;
              }
            } catch {
              // try next
            }
          }
        }

        if (!restoredFromLocal) {
          const historyRaw = window.localStorage.getItem(MULTI_HISTORY_STORAGE_KEY);
          if (historyRaw) {
            const parsed = JSON.parse(historyRaw) as MultiCallHistoryEntry[];
            if (Array.isArray(parsed)) {
              setMultiHistory(parsed);
            }
          }
        }
      } catch {
        // ignore local restore errors and try server
      } finally {
        if (!cancelled) {
          hasLoadedSnapshotRef.current = true;
        }
      }

      // Rehydrate from backend source-of-truth.
      try {
        const serverRecord = localEnvelope?.session_id
          ? await getChatSessionById(localEnvelope.session_id)
          : await getChatSessionLatest();
        if (cancelled) return;
        const serverEnvelope = toEnvelope(serverRecord);
        if (!serverEnvelope) return;
        if (serverEnvelope.revision >= chatSessionRevisionRef.current) {
          applyEnvelope(serverEnvelope);
          const persisted = persistSnapshotToLocalStorage(
            serverEnvelope.data.snapshot,
            serverEnvelope.session_id,
            serverEnvelope.revision,
          );
          if (persisted) {
            queueChatSessionSync(persisted);
          } else {
            queueChatSessionSync(
              buildServerSyncEnvelope(
                serverEnvelope.data.snapshot,
                serverEnvelope.session_id,
                serverEnvelope.revision,
              ),
            );
          }
        }
      } catch {
        // backend rehydrate is best-effort
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [applySnapshotState, queueChatSessionSync]);

  // Grab user location on mount (reverse geocode to city, state)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=10`,
            { headers: { 'User-Agent': 'kiru-app' } },
          );
          if (!res.ok) return;
          const data = await res.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || '';
          const state = addr.state || '';
          if (city || state) {
            setUserLocation([city, state].filter(Boolean).join(', '));
          }
        } catch {
          // Location enrichment is best-effort
        }
      },
      () => {}, // denied — no-op
      { timeout: 5000, maximumAge: 600000 },
    );
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      Object.values(multiSocketRef.current).forEach((socket) => socket.close());
      multiSocketRef.current = {};
    };
  }, []);

  // Flush latest snapshot on navigation/reload/tab background transitions.
  useEffect(() => {
    const flush = () => {
      if (!snapshotRef.current) return;
      const nextRevision = chatSessionRevisionRef.current + 1;
      const persisted = persistSnapshotToLocalStorage(
        snapshotRef.current,
        chatSessionIdRef.current,
        nextRevision,
      );
      chatSessionRevisionRef.current = nextRevision;
      if (persisted) {
        queueChatSessionSync(persisted, true);
      } else {
        queueChatSessionSync(
          buildServerSyncEnvelope(
            snapshotRef.current,
            chatSessionIdRef.current,
            nextRevision,
          ),
          true,
        );
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };

    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (serverSyncTimerRef.current !== null) {
        window.clearTimeout(serverSyncTimerRef.current);
        serverSyncTimerRef.current = null;
      }
    };
  }, [queueChatSessionSync]);

  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }]);
  }, []);

  const applyReadiness = useCallback((readiness: VoiceReadiness) => {
    const warning = buildReadinessWarning(readiness);
    setReadinessWarning(warning);
  }, []);

  const ensureLiveDialReady = useCallback(async (fallbackPhase: ConversationPhase): Promise<boolean> => {
    try {
      const readiness = await checkVoiceReadiness();
      applyReadiness(readiness);
      if (readiness.can_dial_live) return true;
      const warning = buildReadinessWarning(readiness) ?? 'Voice system is not ready for live calling.';
      addMessage({
        role: 'ai',
        text: `${warning} Start with ./scripts/dev-up.sh --ngrok and try again.`,
      });
    } catch {
      addMessage({
        role: 'ai',
        text: 'Could not verify voice readiness. Check backend health and retry.',
      });
    }
    setPhase(fallbackPhase);
    return false;
  }, [addMessage, applyReadiness]);

  // Voice readiness check on mount
  useEffect(() => {
    checkVoiceReadiness()
      .then(applyReadiness)
      .catch(() => {});
  }, [applyReadiness]);

  useEffect(() => {
    if (!hasLoadedSnapshotRef.current) return;
    const snapshot: ChatSnapshot = {
      messages: messages.slice(-SNAPSHOT_MAX_MESSAGES).map(compactMessage),
      input,
      phase,
      objective,
      phoneNumber,
      taskId,
      sessionId,
      callStatus,
      readinessWarning,
      researchContext: compactText(researchContext || '', 4500),
      analysisLoaded,
      sidebarOpen,
      discoveryResults: discoveryResults.slice(0, SNAPSHOT_MAX_SEARCH_RESULTS).map(compactBusinessResult),
      manualPhones,
      manualPhoneInput,
      concurrentTestMode,
      concurrentRunMode,
      concurrentTargetCount,
      autoSourceNumbers,
      multiCallTargets: Object.fromEntries(
        Object.entries(multiCallTargets).map(([phone, target]) => [
          phone,
          {
            ...target,
            title: target.title ? compactText(target.title, 200) : target.title,
            snippet: target.snippet ? compactText(target.snippet, 360) : target.snippet,
          },
        ]),
      ),
      multiCalls: Object.fromEntries(
        Object.entries(multiCalls).map(([phone, state]) => [
          phone,
          {
            ...state,
            transcript: state.transcript
              .slice(-SNAPSHOT_MAX_MULTI_TRANSCRIPT)
              .map((entry) => ({ ...entry, text: compactText(entry.text || '', 400) })),
            analysis: compactAnalysis(state.analysis),
            analysisError: state.analysisError ? compactText(state.analysisError, 300) : null,
          },
        ]),
      ),
      multiHistory: multiHistory.slice(0, 30),
      activeMultiHistoryId,
      userLocation,
      multiSummary: compactMultiSummary(multiSummary),
      multiSummaryState,
      multiSummaryError,
      personalHandoffNumber,
      singleDtmfInput,
      multiDtmfInputs,
    };
    snapshotRef.current = snapshot;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      const latestSnapshot = snapshotRef.current;
      if (!latestSnapshot) return;
      const nextRevision = chatSessionRevisionRef.current + 1;
      const persisted = persistSnapshotToLocalStorage(latestSnapshot, chatSessionIdRef.current, nextRevision);
      chatSessionRevisionRef.current = nextRevision;
      if (persisted) {
        queueChatSessionSync(persisted);
      } else {
        queueChatSessionSync(buildServerSyncEnvelope(latestSnapshot, chatSessionIdRef.current, nextRevision));
      }
      persistTimerRef.current = null;
    }, SNAPSHOT_PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    messages,
    input,
    phase,
    objective,
    phoneNumber,
    taskId,
    sessionId,
    callStatus,
    readinessWarning,
    researchContext,
    analysisLoaded,
    sidebarOpen,
    discoveryResults,
    manualPhones,
    manualPhoneInput,
    concurrentTestMode,
    concurrentRunMode,
    concurrentTargetCount,
    autoSourceNumbers,
    multiCallTargets,
    multiCalls,
    multiHistory,
    activeMultiHistoryId,
    userLocation,
    multiSummary,
    multiSummaryState,
    multiSummaryError,
    personalHandoffNumber,
    singleDtmfInput,
    multiDtmfInputs,
    queueChatSessionSync,
  ]);

  const aiReply = useCallback((text: string, delay = 700) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      addMessage({ role: 'ai', text });
    }, delay);
  }, [addMessage]);

  // Fetch and insert analysis + audio messages
  const loadAnalysis = useCallback(async (tid: string) => {
    if (analysisLoadedRef.current) return;
    analysisLoadedRef.current = true;
    try {
      const data = await getTaskAnalysis(tid);
      setMessages((prev) => [
        ...prev,
        { id: `analysis-${Date.now()}`, role: 'analysis', text: '', analysisData: data },
        { id: `audio-${Date.now()}`, role: 'audio', text: '', audioTaskId: tid },
      ]);
      setAnalysisLoaded(true);
    } catch {
      analysisLoadedRef.current = false;
    }
  }, []);

  const updateMultiCall = useCallback((phone: string, patch: Partial<MultiCallState>) => {
    const prev = multiCallsRef.current[phone];
    const next: MultiCallState = {
      taskId: patch.taskId ?? prev?.taskId ?? '',
      sessionId: patch.sessionId ?? prev?.sessionId ?? null,
      status: patch.status ?? prev?.status ?? 'pending',
      transcript: patch.transcript ?? prev?.transcript ?? [],
      thinking: patch.thinking ?? prev?.thinking ?? false,
      analysis: patch.analysis ?? prev?.analysis ?? null,
      analysisState: patch.analysisState ?? prev?.analysisState ?? 'idle',
      analysisError: patch.analysisError ?? prev?.analysisError ?? null,
    };
    multiCallsRef.current = { ...multiCallsRef.current, [phone]: next };
    setMultiCalls(multiCallsRef.current);
  }, []);

  const appendMultiTranscript = useCallback((phone: string, role: MultiCallTranscriptEntry['role'], text: string) => {
    if (!text.trim()) return;
    const prev = multiCallsRef.current[phone];
    if (!prev) return;
    const entry: MultiCallTranscriptEntry = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      text,
    };
    updateMultiCall(phone, { transcript: [...prev.transcript, entry] });
  }, [updateMultiCall]);

  const setMultiThinking = useCallback((phone: string, thinking: boolean) => {
    if (!multiCallsRef.current[phone]) return;
    updateMultiCall(phone, { thinking });
  }, [updateMultiCall]);

  const persistMultiHistory = useCallback((entries: MultiCallHistoryEntry[]) => {
    try {
      window.localStorage.setItem(MULTI_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore persistence errors
    }
  }, []);

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }), []);

  const fetchAnalysisWithRetry = useCallback(async (tid: string): Promise<AnalysisPayload | null> => {
    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const analysis = await getTaskAnalysis(tid);
        return analysis;
      } catch {
        if (attempt === maxAttempts) break;
        await wait(1200);
      }
    }
    return null;
  }, [wait]);

  const loadMultiSummary = useCallback(async (taskIds: string[], objectiveText: string, force = false) => {
    const deduped = Array.from(new Set(taskIds.filter(Boolean)));
    if (deduped.length === 0) return;
    const requestKey = `${objectiveText}::${deduped.slice().sort().join(',')}`;
    if (
      !force
      && activeSummaryRequestRef.current === requestKey
      && (multiSummaryState === 'loading' || multiSummaryState === 'ready' || multiSummaryState === 'error')
    ) {
      return;
    }
    activeSummaryRequestRef.current = requestKey;
    setMultiSummaryState('loading');
    setMultiSummaryError(null);

    try {
      const response = await getMultiCallSummary(deduped, objectiveText);
      setMultiSummary(response.summary);
      setMultiSummaryState('ready');
      addMessage({
        role: 'ai',
        text: 'I compared every completed call and prepared one combined recommendation with all key pricing and terms.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMultiSummary(null);
      setMultiSummaryState('error');
      setMultiSummaryError(message);
    }
  }, [addMessage, multiSummaryState]);

  const hydrateMultiCallArtifacts = useCallback(async (phone: string, tid: string) => {
    if (!phone || !tid) return;
    const state = multiCallsRef.current[phone];
    if (!state) return;
    if (state.analysisState === 'loading' || state.analysisState === 'ready') return;

    updateMultiCall(phone, { analysisState: 'loading', analysisError: null });
    try {
      const [transcriptRes, analysis] = await Promise.all([
        getTaskTranscript(tid).catch(() => null),
        fetchAnalysisWithRetry(tid),
      ]);

      const transcriptEntries: MultiCallTranscriptEntry[] = (transcriptRes?.turns || []).map((turn) => ({
        id: `${Date.now()}-${Math.random()}`,
        role: turn.speaker === 'agent' ? 'agent' : 'caller',
        text: turn.content,
      }));

      const current = multiCallsRef.current[phone];
      updateMultiCall(phone, {
        transcript: transcriptEntries.length > 0 ? transcriptEntries : (current?.transcript ?? []),
        analysis: analysis ?? null,
        analysisState: analysis ? 'ready' : 'error',
        analysisError: analysis ? null : 'Summary not ready yet',
        thinking: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      updateMultiCall(phone, { analysisState: 'error', analysisError: message, thinking: false });
    }
  }, [fetchAnalysisWithRetry, updateMultiCall]);

  const maybeFinalizeMultiCalls = useCallback(() => {
    const states = Object.values(multiCallsRef.current);
    if (states.length === 0) return;
    const allDone = states.every((state) => state.status === 'ended' || state.status === 'failed');
    if (!allDone || multiEndedAnnouncedRef.current) return;
    multiEndedAnnouncedRef.current = true;
    setCallStatus('ended');
    setPhase('ended');
    refreshPastTasks();
    addMessage({ role: 'ai', text: 'All concurrent test calls have ended.' });
  }, [addMessage, refreshPastTasks]);

  useEffect(() => {
    Object.entries(multiCalls).forEach(([phone, state]) => {
      if (!state.taskId) return;
      if (state.status !== 'ended' && state.status !== 'failed') return;
      if (state.analysisState === 'idle') {
        void hydrateMultiCallArtifacts(phone, state.taskId);
      }
    });
  }, [hydrateMultiCallArtifacts, multiCalls]);

  useEffect(() => {
    if (!concurrentTestMode) return;
    const states = Object.values(multiCalls);
    if (states.length === 0) return;
    const allDone = states.every((state) => state.status === 'ended' || state.status === 'failed');
    if (!allDone) return;
    const taskIds = states.map((state) => state.taskId).filter(Boolean);
    if (taskIds.length === 0) return;
    if (multiSummaryState === 'ready' && multiSummary) return;
    if (multiSummaryState === 'loading') return;
    if (multiSummaryState === 'error') return;
    void loadMultiSummary(taskIds, objective);
  }, [concurrentTestMode, loadMultiSummary, multiCalls, multiSummary, multiSummaryState, objective]);

  // Live-update fallback: poll task status in concurrent mode so ended calls
  // finalize even if websocket end events are missed.
  useEffect(() => {
    if (!concurrentTestMode) return;

    let stopped = false;

    const poll = async () => {
      const activeEntries = Object.entries(multiCallsRef.current).filter(([, state]) => (
        Boolean(state.taskId)
        && state.status !== 'ended'
        && state.status !== 'failed'
      ));
      if (activeEntries.length === 0) {
        return;
      }

      const results = await Promise.all(activeEntries.map(async ([phone, state]) => {
        try {
          const task = await getTask(state.taskId);
          return { phone, status: task.status as MultiCallEventStatus, taskId: state.taskId };
        } catch {
          return null;
        }
      }));

      if (stopped) return;

      results.forEach((result) => {
        if (!result) return;
        const current = multiCallsRef.current[result.phone];
        if (!current) return;
        if (current.status !== result.status) {
          updateMultiCall(result.phone, { status: result.status });
          if (result.status === 'ended' || result.status === 'failed') {
            setMultiThinking(result.phone, false);
            void hydrateMultiCallArtifacts(result.phone, result.taskId);
          }
        }
      });

      maybeFinalizeMultiCalls();
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [concurrentTestMode, hydrateMultiCallArtifacts, maybeFinalizeMultiCalls, setMultiThinking, updateMultiCall]);

  // Handle incoming WebSocket events
  const handleCallEvent = useCallback((event: CallEvent, context?: { phone?: string; taskId?: string; multi?: boolean }) => {
    const isMulti = Boolean(context?.multi && context?.phone);
    const phone = context?.phone;

    if (isMulti && phone) {
      const action = (event.data as { action?: string; digits?: string }).action;
      const actionDigits = (event.data as { digits?: string }).digits?.trim();

      switch (event.type) {
        case 'call_status': {
          const rawStatus = (event.data as { status?: string }).status || 'pending';
          const status = rawStatus as MultiCallEventStatus;
          const errorData = event.data as { status?: string; error?: string };
          updateMultiCall(phone, { status, taskId: context?.taskId });

          if (status === 'dialing' || status === 'active' || status === 'ended' || status === 'failed' || status === 'disconnected') {
            const label = MULTI_STATUS_LABEL[status] ?? status;
            appendMultiTranscript(
              phone,
              'status',
              status === 'failed' && errorData.error ? `${label}: ${errorData.error}` : label,
            );
          }
          if (action === 'dtmf_sent' && actionDigits) {
            appendMultiTranscript(phone, 'status', `Sent keypad digits: ${actionDigits}`);
          }
          if (status === 'active') {
            setPhase('active');
          }
          if (status === 'ended' || status === 'failed') {
            setMultiThinking(phone, false);
            void hydrateMultiCallArtifacts(phone, context?.taskId ?? multiCallsRef.current[phone]?.taskId ?? '');
            maybeFinalizeMultiCalls();
          }
          return;
        }
        case 'transcript_update': {
          const { speaker, content } = event.data;
          appendMultiTranscript(phone, speaker === 'agent' ? 'agent' : 'caller', content);
          if (speaker === 'agent') {
            setMultiThinking(phone, false);
          }
          return;
        }
        case 'agent_thinking': {
          setMultiThinking(phone, true);
          return;
        }
        case 'strategy_update': {
          const tactics = event.data.tactics;
          if (tactics && tactics.length > 0) {
            appendMultiTranscript(phone, 'status', `Strategy: ${tactics.join(', ')}`);
          }
          return;
        }
        case 'analysis_ready': {
          appendMultiTranscript(phone, 'status', 'Analysis ready');
          return;
        }
      }
    }

    switch (event.type) {
      case 'call_status': {
        const status = event.data.status;
        const action = (event.data as { action?: string; digits?: string }).action;
        const actionDigits = (event.data as { digits?: string }).digits?.trim();
        if (action === 'dtmf_sent' && actionDigits) {
          addMessage({ role: 'status', text: `Sent keypad digits: ${actionDigits}` });
        }
        setCallStatus(status);

        if (status === 'dialing') {
          addMessage({ role: 'status', text: 'Dialing...' });
        } else if (status === 'active') {
          addMessage({ role: 'status', text: 'Connected' });
          setPhase('active');
        } else if (status === 'ended') {
          addMessage({ role: 'status', text: 'Call ended' });
          addMessage({ role: 'ai', text: 'The call has ended. Preparing your analysis...' });
          setPhase('ended');
        } else if (status === 'failed') {
          const errorData = event.data as { status: CallStatus; error?: string };
          addMessage({ role: 'status', text: `Call failed${errorData.error ? `: ${errorData.error}` : ''}` });
          setPhase('ended');
        }
        break;
      }
      case 'transcript_update': {
        const { speaker, content } = event.data;
        if (speaker === 'agent') addMessage({ role: 'ai', text: content });
        else addMessage({ role: 'status', text: `Rep: ${content}` });
        setTyping(false);
        break;
      }
      case 'agent_thinking': {
        setTyping(true);
        break;
      }
      case 'strategy_update': {
        const tactics = event.data.tactics;
        if (tactics && tactics.length > 0) {
          addMessage({ role: 'status', text: `Strategy: ${tactics.join(', ')}` });
        }
        break;
      }
      case 'analysis_ready': {
        const tid = event.data.task_id;
        if (tid) loadAnalysis(tid);
        break;
      }
    }
  }, [addMessage, appendMultiTranscript, hydrateMultiCallArtifacts, loadAnalysis, maybeFinalizeMultiCalls, setMultiThinking, updateMultiCall]);

  // Fallback: load analysis 5s after call ends if event never arrived
  useEffect(() => {
    if (phase === 'ended' && taskId && !analysisLoadedRef.current) {
      const timer = setTimeout(() => {
        loadAnalysis(taskId);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase, taskId, loadAnalysis]);

  // Connect single-call WebSocket
  const connectWebSocket = useCallback((identifier: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    const socket = createCallSocket(identifier, (event) => handleCallEvent(event));
    socket.onclose = () => {};
    socketRef.current = socket;
  }, [handleCallEvent]);

  // Connect one WebSocket per concurrent test call
  const connectMultiWebSocket = useCallback((phone: string, taskId: string) => {
    const existing = multiSocketRef.current[phone];
    if (existing) existing.close();
    const socket = createCallSocket(taskId, (event) => handleCallEvent(event, { phone, taskId, multi: true }));
    socket.onclose = () => {};
    multiSocketRef.current[phone] = socket;
  }, [handleCallEvent]);

  async function startNegotiation(
    phone: string,
    objectiveText?: string,
    targetMeta?: { title?: string | null; url?: string | null; snippet?: string | null; source?: 'manual' | 'exa' | 'search' },
  ) {
    const resolvedPhone = normalizePhone(phone);
    if (!resolvedPhone) {
      setPhase('phone');
      addMessage({ role: 'ai', text: 'Please enter a valid US phone number, like (650) 555-1212.' });
      return;
    }
    if (!(await ensureLiveDialReady('phone'))) return;

    setActiveMultiHistoryId(null);
    setMultiCallTargets({});
    setSingleDtmfInput('');
    setPhase('connecting');
    addMessage({ role: 'status', text: 'Setting up your negotiation...' });

    try {
      const resolvedObjective = (objectiveText ?? objective).trim();
      const task = await createTask({
        target_phone: resolvedPhone,
        objective: resolvedObjective,
        task_type: 'custom',
        style: 'collaborative',
        ...(researchContext && { context: researchContext }),
        ...(userLocation && { location: userLocation }),
        ...(targetMeta?.title && { target_name: targetMeta.title }),
        ...(targetMeta?.url && { target_url: targetMeta.url }),
        ...(targetMeta?.source && { target_source: targetMeta.source }),
        ...(targetMeta?.snippet && { target_snippet: targetMeta.snippet }),
      });
      setTaskId(task.id);
      resetChatSessionIdentity('task');
      chatSessionIdRef.current = `task-${task.id}`;
      refreshPastTasks();

      const callResult = await startCall(task.id);

      if (!callResult.ok) {
        addMessage({ role: 'ai', text: `Could not start the call: ${callResult.message}. Please try again.` });
        setPhase('objective');
        return;
      }

      const sid = callResult.session_id;
      if (sid) {
        setSessionId(sid);
        connectWebSocket(task.id);
        addMessage({ role: 'ai', text: `Starting your negotiation now. I'll update you in real-time as the call progresses.` });
      } else {
        addMessage({ role: 'ai', text: 'Call initiated. Waiting for connection...' });
        setPhase('active');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addMessage({ role: 'ai', text: `Something went wrong: ${errorMsg}. Please try again.` });
      setPhase('objective');
    }
  }

  async function startConcurrentTestCalls(
    rawPhones: string[],
    objectiveText?: string,
    mode: ConcurrentMode = concurrentRunMode,
    runId: string = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    targetDirectory?: Record<string, MultiCallTargetMeta>,
  ) {
    resetChatSessionIdentity('run');
    chatSessionIdRef.current = `run-${runId}`;

    const normalizedPhones = Array.from(
      new Set(
        rawPhones
          .map((phone) => normalizePhone(phone))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (normalizedPhones.length === 0) {
      setPhase('phone');
      addMessage({ role: 'ai', text: 'Add at least one valid US phone number to start concurrent calls.' });
      return;
    }
    if (!(await ensureLiveDialReady('objective'))) return;

    closeAllSockets();
    setSessionId(null);
    setTaskId(null);
    setMultiCallTargets({});
    setMultiCalls({});
    multiCallsRef.current = {};
    setSingleDtmfInput('');
    setMultiSummary(null);
    setMultiSummaryState('idle');
    setMultiSummaryError(null);
    setMultiDtmfInputs({});
    activeSummaryRequestRef.current = null;
    setActiveMultiHistoryId(null);

    const phones = normalizedPhones.slice(0, MAX_CONCURRENT_TEST_CALLS);
    if (normalizedPhones.length > MAX_CONCURRENT_TEST_CALLS) {
      addMessage({
        role: 'status',
        text: `Running first ${MAX_CONCURRENT_TEST_CALLS} numbers to keep the concurrent run stable.`,
      });
    }

    setPhase('connecting');
    multiEndedAnnouncedRef.current = false;
    addMessage({
      role: 'status',
      text: `Starting ${phones.length} concurrent ${mode} call${phones.length === 1 ? '' : 's'} (chat ${runId.slice(0, 12)})...`,
    });

    const resolvedObjective = (objectiveText ?? objective).trim()
      || (mode === 'test' ? 'Have a friendly open-ended conversation.' : '');
    if (!resolvedObjective) {
      setPhase('objective');
      addMessage({ role: 'ai', text: 'Real mode needs a clear objective before starting concurrent calls.' });
      return;
    }

    const resolvedTargetDirectory: Record<string, MultiCallTargetMeta> = {};
    phones.forEach((phone) => {
      const fromInput = targetDirectory?.[phone];
      const fromState = multiCallTargets[phone];
      const selected = fromInput ?? fromState;
      resolvedTargetDirectory[phone] = selected
        ? { ...selected, phone }
        : { phone, source: 'manual', title: null, url: null, snippet: null };
    });
    setMultiCallTargets(resolvedTargetDirectory);
    const targetPreview = phones
      .map((phone) => resolvedTargetDirectory[phone]?.title || formatPhone(phone))
      .slice(0, 3);
    if (targetPreview.length > 0) {
      addMessage({
        role: 'status',
        text: `Dial targets: ${targetPreview.join(' | ')}${phones.length > 3 ? ' | ...' : ''}`,
      });
    }

    // Stagger call placement: create all tasks in parallel, then start calls
    // sequentially with a short delay to avoid Twilio rate-limiting and
    // backend race conditions that cause the last calls to fail.
    const taskCreationResults = await Promise.all(phones.map(async (phone) => {
      try {
        const selectedTarget = resolvedTargetDirectory[phone];
        const targetHeader = selectedTarget?.title
          ? `Active call target: ${selectedTarget.title} (${phone})${selectedTarget.url ? `, ${selectedTarget.url}` : ''}.`
          : `Active call target phone: ${phone}.`;
        const antiSearchNote = 'You are already connected to this exact business. Do not say you are still searching for nearby options or trying to find who to call.';
        const contextualNotes = [
          targetHeader,
          antiSearchNote,
          selectedTarget?.snippet ? `Target notes: ${selectedTarget.snippet}` : null,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n');
        const mergedContext = [researchContext, contextualNotes]
          .filter((chunk): chunk is string => Boolean(chunk && chunk.trim()))
          .join('\n\n');

        const task = await createTask({
          target_phone: phone,
          objective: resolvedObjective,
          task_type: 'custom',
          style: 'collaborative',
          run_id: runId,
          run_mode: mode,
          ...(mergedContext && { context: mergedContext }),
          ...(userLocation && { location: userLocation }),
          ...(selectedTarget?.title && { target_name: selectedTarget.title }),
          ...(selectedTarget?.url && { target_url: selectedTarget.url }),
          ...(selectedTarget?.source && { target_source: selectedTarget.source }),
          ...(selectedTarget?.snippet && { target_snippet: selectedTarget.snippet }),
        });
        return { ok: true as const, phone, taskId: task.id };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        return { ok: false as const, phone, errorMsg };
      }
    }));

    // Start calls sequentially with 500ms stagger to let each Twilio media
    // stream register before the next call arrives.
    const results: Array<
      | { ok: true; phone: string; taskId: string; sessionId: string; callResult: any }
      | { ok: false; phone: string; errorMsg: string }
    > = [];
    for (let i = 0; i < taskCreationResults.length; i++) {
      const taskResult = taskCreationResults[i];
      if (!taskResult.ok) {
        results.push(taskResult);
        continue;
      }
      try {
        if (i > 0) await new Promise((r) => setTimeout(r, 500));
        const callResult = await startCall(taskResult.taskId);
        results.push({ ok: true, phone: taskResult.phone, taskId: taskResult.taskId, sessionId: callResult.session_id, callResult });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ ok: false, phone: taskResult.phone, errorMsg });
      }
    }

    let startedCount = 0;
    const newState: Record<string, MultiCallState> = {};
    const socketsToConnect: Array<{ phone: string; taskId: string }> = [];
    for (const result of results) {
      if (!result.ok) {
        newState[result.phone] = {
          taskId: '',
          sessionId: null,
          status: 'failed',
          transcript: [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: `Failed to start: ${result.errorMsg}` }],
          thinking: false,
          analysis: null,
          analysisState: 'error',
          analysisError: 'Call failed to start',
        };
        continue;
      }
      if (!result.callResult.ok) {
        newState[result.phone] = {
          taskId: result.taskId,
          sessionId: result.sessionId,
          status: 'failed',
          transcript: [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: `Could not start: ${result.callResult.message}` }],
          thinking: false,
          analysis: null,
          analysisState: 'error',
          analysisError: result.callResult.message || 'Call could not start',
        };
        continue;
      }
      startedCount += 1;
      newState[result.phone] = {
        taskId: result.taskId,
        sessionId: result.sessionId,
        status: 'dialing',
        transcript: [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: 'Dialing' }],
        thinking: false,
        analysis: null,
        analysisState: 'idle',
        analysisError: null,
      };
      if (result.sessionId) {
        socketsToConnect.push({ phone: result.phone, taskId: result.taskId });
      }
    }

    multiCallsRef.current = { ...multiCallsRef.current, ...newState };
    setMultiCalls(multiCallsRef.current);
    socketsToConnect.forEach(({ phone, taskId }) => connectMultiWebSocket(phone, taskId));
    setManualPhones(phones);
    setManualPhoneInput('');
    refreshPastTasks();

    const historyCalls = Object.entries(newState)
      .filter(([, state]) => Boolean(state.taskId))
      .map(([phone, state]) => ({ phone, taskId: state.taskId }));
    if (historyCalls.length > 0) {
      const historyEntry: MultiCallHistoryEntry = {
        id: runId,
        objective: resolvedObjective,
        createdAt: new Date().toISOString(),
        mode,
        calls: historyCalls,
      };
      setMultiHistory((prev) => {
        const withoutDup = prev.filter((entry) => entry.id !== historyEntry.id);
        const next = [historyEntry, ...withoutDup].slice(0, 30);
        persistMultiHistory(next);
        return next;
      });
      setActiveMultiHistoryId(historyEntry.id);
    }

    if (startedCount > 0) {
      setPhase('active');
      addMessage({
        role: 'ai',
        text: `Concurrent ${mode} mode active. Chat ${runId.slice(0, 12)} is streaming ${startedCount} live call${startedCount === 1 ? '' : 's'} in isolated panels.`,
      });
    } else {
      setPhase('phone');
      addMessage({ role: 'ai', text: 'Could not start any calls. Check numbers and try again.' });
    }
  }

  async function handleEndCall() {
    if (concurrentTestMode && Object.keys(multiCallsRef.current).length > 0) {
      const activeTaskIds = Array.from(
        new Set(
          Object.values(multiCallsRef.current)
            .filter((state) => state.taskId && (state.status === 'dialing' || state.status === 'connected' || state.status === 'media_connected' || state.status === 'active'))
            .map((state) => state.taskId),
        ),
      );
      if (activeTaskIds.length === 0) return;
      try {
        await Promise.all(activeTaskIds.map((id) => stopCall(id)));
        addMessage({ role: 'status', text: `Ending ${activeTaskIds.length} active call${activeTaskIds.length === 1 ? '' : 's'}...` });
      } catch {
        addMessage({ role: 'ai', text: 'Could not end one or more calls. They may have already ended.' });
      }
      return;
    }

    if (taskId) {
      try {
        const result = await stopCall(taskId);
        if (result.ok) {
          addMessage({ role: 'status', text: 'Ending call...' });
        } else {
          addMessage({ role: 'ai', text: result.message || 'Could not end the call.' });
        }
      } catch {
        addMessage({ role: 'ai', text: 'Could not end the call. It may have already ended.' });
      }
    }
  }

  async function handleTransferToPersonal(callTaskId: string, phoneLabel?: string) {
    const normalizedTarget = normalizePhone(personalHandoffNumber);
    if (!normalizedTarget) {
      addMessage({
        role: 'ai',
        text: 'Set a valid personal handoff number first (example: +16505551212).',
      });
      return;
    }

    const result = await transferCall(callTaskId, normalizedTarget);
    if (result.ok) {
      const targetLabel = phoneLabel ? ` for ${formatPhone(phoneLabel)}` : '';
      addMessage({
        role: 'status',
        text: `Transfer requested${targetLabel}. Twilio will bridge to ${formatPhone(normalizedTarget)}.`,
      });
      if (phoneLabel) {
        appendMultiTranscript(phoneLabel, 'status', `Transfer requested to ${formatPhone(normalizedTarget)}`);
      }
      return;
    }

    addMessage({
      role: 'ai',
      text: `Transfer failed: ${result.message}`,
    });
    if (phoneLabel) {
      appendMultiTranscript(phoneLabel, 'status', `Transfer failed: ${result.message}`);
    }
  }

  async function handleSendDtmf(callTaskId: string, digits: string, phoneLabel?: string) {
    const normalizedDigits = normalizeDtmfInput(digits);
    if (!normalizedDigits) {
      addMessage({ role: 'ai', text: 'Enter keypad digits first (e.g., 1, 2, 0w3).' });
      return;
    }
    if (!/^[0-9A-D#*W,]+$/.test(normalizedDigits)) {
      addMessage({ role: 'ai', text: 'Invalid DTMF input. Use only 0-9, *, #, A-D, w (or W), and commas for pauses.' });
      return;
    }

    const result = await sendCallDtmf(callTaskId, normalizedDigits);
    if (result.ok) {
      const targetLabel = phoneLabel ? ` for ${formatPhone(phoneLabel)}` : '';
      addMessage({
        role: 'status',
        text: `Sent keypad digits${targetLabel}: ${normalizedDigits}`,
      });
      if (phoneLabel) {
        appendMultiTranscript(phoneLabel, 'status', `Sent keypad digits: ${normalizedDigits}`);
      }
      return;
    }

    addMessage({ role: 'ai', text: `Keypad send failed: ${result.message}` });
    if (phoneLabel) {
      appendMultiTranscript(phoneLabel, 'status', `Keypad send failed: ${result.message}`);
    }
  }

  function handleNewNegotiation() {
    closeAllSockets();
    resetChatSessionIdentity('chat');
    try {
      window.localStorage.removeItem(CHAT_SNAPSHOT_STORAGE_KEY);
      window.localStorage.removeItem(CHAT_SNAPSHOT_FALLBACK_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    setMessages([{ id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' }]);
    setInput('');
    setPhase('objective');
    setTyping(false);
    setObjective('');
    setPhoneNumber('');
    setTaskId(null);
    setSessionId(null);
    setCallStatus('pending');
    setResearchContext('');
    setAnalysisLoaded(false);
    setDiscoveryResults([]);
    setManualPhones([]);
    setManualPhoneInput('');
    setConcurrentTestMode(false);
    setConcurrentRunMode('test');
    setConcurrentTargetCount(3);
    setAutoSourceNumbers(true);
    setMultiCallTargets({});
    setMultiCalls({});
    multiCallsRef.current = {};
    setMultiSummary(null);
    setMultiSummaryState('idle');
    setMultiSummaryError(null);
    setSingleDtmfInput('');
    setMultiDtmfInputs({});
    setPersonalHandoffNumber('');
    activeSummaryRequestRef.current = null;
    multiEndedAnnouncedRef.current = false;
    setActiveMultiHistoryId(null);
    analysisLoadedRef.current = false;
    refreshPastTasks();
  }

  function handleCallFromSearch(result: BusinessResult, phone: string) {
    setPhoneNumber(phone);
    addMessage({ role: 'user', text: `Call ${result.title || phone}` });
    // Enrich context with this specific result
    const snippet = result.snippet || '';
    const extra = `Selected business: ${result.title || 'Unknown'}\n${snippet}`;
    setResearchContext((prev) => (prev ? `${prev}\n\n${extra}` : extra));
    startNegotiation(phone, undefined, {
      source: 'search',
      title: result.title ?? null,
      url: result.url ?? null,
      snippet: result.snippet ?? null,
    });
  }

  function addManualNumbers(raw: string): string[] {
    const parsed = parsePhonesFromText(raw);
    if (parsed.length === 0) return [];
    setManualPhones((prev) => Array.from(new Set([...prev, ...parsed])));
    setMultiCallTargets((prev) => {
      const next = { ...prev };
      parsed.forEach((phone) => {
        if (next[phone]) return;
        next[phone] = { phone, source: 'manual', title: null, url: null, snippet: null };
      });
      return next;
    });
    return parsed;
  }

  function handleManualAdd() {
    const added = addManualNumbers(manualPhoneInput);
    if (added.length === 0) {
      addMessage({ role: 'ai', text: 'I could not find valid US phone numbers there. Try format like (650) 555-1212.' });
      return;
    }
    setManualPhoneInput('');
    addMessage({ role: 'status', text: `Added ${added.length} manual number${added.length === 1 ? '' : 's'}` });
  }

  function handleManualCall(phone: string) {
    if (concurrentTestMode && phase === 'objective') {
      addMessage({ role: 'status', text: `Ready: ${formatPhone(phone)} added for concurrent test run.` });
      return;
    }
    setPhoneNumber(phone);
    addMessage({ role: 'user', text: `Call ${formatPhone(phone)}` });
    startNegotiation(phone);
  }

  function handleRemoveManualPhone(phone: string) {
    setManualPhones((prev) => prev.filter((p) => p !== phone));
    setMultiCallTargets((prev) => {
      if (!prev[phone]) return prev;
      const next = { ...prev };
      delete next[phone];
      return next;
    });
  }

  function handleSkipDiscovery() {
    setPhase('phone');
    addMessage({ role: 'user', text: 'I have my own number' });
    aiReply("No problem. What's the phone number I should call?", 500);
  }

  async function loadPastChat(id: string) {
    closeAllSockets();
    resetChatSessionIdentity('task');
    chatSessionIdRef.current = `task-${id}`;

    const newMessages: Message[] = [];

    try {
      const [task, transcriptRes] = await Promise.all([
        getTask(id),
        getTaskTranscript(id).catch(() => null),
      ]);

      setTaskId(id);
      setObjective(task.objective || '');
      setPhoneNumber(task.target_phone || '');
      setCallStatus('pending');
      setSessionId(null);
      setResearchContext('');
      setTyping(false);
      setDiscoveryResults([]);
      setManualPhones([]);
      setManualPhoneInput('');
      setConcurrentTestMode(false);
      setConcurrentRunMode('test');
      setConcurrentTargetCount(3);
      setAutoSourceNumbers(true);
      setMultiCallTargets({});
      setMultiCalls({});
      multiCallsRef.current = {};
      setMultiSummary(null);
      setMultiSummaryState('idle');
      setMultiSummaryError(null);
      setSingleDtmfInput('');
      setMultiDtmfInputs({});
      activeSummaryRequestRef.current = null;
      multiEndedAnnouncedRef.current = false;

      newMessages.push({ id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' });
      if (task.objective) {
        newMessages.push({ id: `obj-${Date.now()}`, role: 'user', text: task.objective });
      }
      if (task.target_phone) {
        newMessages.push({ id: `ai-phone-${Date.now()}`, role: 'ai', text: "Got it. What's the phone number I should call?" });
        newMessages.push({ id: `phone-${Date.now()}`, role: 'user', text: task.target_phone });
      }

      if (transcriptRes?.turns?.length) {
        newMessages.push({ id: `status-connected-${Date.now()}`, role: 'status', text: 'Connected' });
        for (const turn of transcriptRes.turns) {
          const msgId = `t-${Date.now()}-${Math.random()}`;
          if (turn.speaker === 'agent') {
            newMessages.push({ id: msgId, role: 'ai', text: turn.content });
          } else {
            newMessages.push({ id: msgId, role: 'status', text: `Receiver: ${turn.content}` });
          }
        }
        newMessages.push({ id: `status-ended-${Date.now()}`, role: 'status', text: 'Call ended' });
      }

      try {
        const analysis = await getTaskAnalysis(id);
        newMessages.push({ id: `analysis-${Date.now()}`, role: 'analysis', text: '', analysisData: analysis });
        newMessages.push({ id: `audio-${Date.now()}`, role: 'audio', text: '', audioTaskId: id });
        setAnalysisLoaded(true);
        analysisLoadedRef.current = true;
      } catch {
        setAnalysisLoaded(false);
        analysisLoadedRef.current = false;
      }

      setMessages(newMessages);
      setPhase('ended');
      setActiveMultiHistoryId(null);
    } catch {
      // If loading fails, just stay where we are
    }
  }

  async function loadMultiHistoryChat(historyId: string) {
    const historyFromLocal = multiHistory.find((entry) => entry.id === historyId);
    const historyFromTasks = (() => {
      const groupedTasks = pastTasks
        .filter((task) => task.run_id === historyId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      if (groupedTasks.length === 0) return null;
      return {
        id: historyId,
        objective: groupedTasks[0]?.objective ?? '',
        createdAt: groupedTasks[0]?.created_at ?? new Date().toISOString(),
        mode: groupedTasks[0]?.run_mode === 'real' ? 'real' : 'test',
        calls: groupedTasks.map((task) => ({ phone: task.target_phone, taskId: task.id })),
      } satisfies MultiCallHistoryEntry;
    })();
    const history = historyFromLocal ?? historyFromTasks;
    if (!history) return;

    closeAllSockets();
    resetChatSessionIdentity('run');
    chatSessionIdRef.current = `run-${historyId}`;
    setActiveMultiHistoryId(history.id);
    setConcurrentTestMode(true);
    setObjective(history.objective);
    setPhoneNumber('');
    setTaskId(null);
    setSessionId(null);
    setCallStatus('ended');
    setTyping(false);
    setAnalysisLoaded(false);
    analysisLoadedRef.current = false;
    setDiscoveryResults([]);
    setManualPhones(history.calls.map((call) => call.phone));
    setMultiCallTargets(
      history.calls.reduce<Record<string, MultiCallTargetMeta>>((acc, call) => {
        acc[call.phone] = {
          phone: call.phone,
          source: 'manual',
          title: null,
          url: null,
          snippet: null,
        };
        return acc;
      }, {}),
    );
    setManualPhoneInput('');
    setConcurrentRunMode(history.mode === 'real' ? 'real' : 'test');
    setConcurrentTargetCount(clampConcurrentCount(history.calls.length || 3));
    setAutoSourceNumbers(true);
    setResearchContext('');
    setMultiSummary(null);
    setMultiSummaryState('loading');
    setMultiSummaryError(null);
    setSingleDtmfInput('');
    setMultiDtmfInputs({});
    activeSummaryRequestRef.current = null;
    setPhase('ended');

    setMessages([
      { id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' },
      { id: `obj-${Date.now()}`, role: 'user', text: history.objective },
      { id: `multi-${Date.now()}`, role: 'ai', text: `Loaded concurrent run with ${history.calls.length} call${history.calls.length === 1 ? '' : 's'}.` },
    ]);

    const initialStates: Record<string, MultiCallState> = {};
    history.calls.forEach(({ phone, taskId: callTaskId }) => {
      initialStates[phone] = {
        taskId: callTaskId,
        sessionId: null,
        status: 'ended',
        transcript: [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: 'Loading saved transcript...' }],
        thinking: false,
        analysis: null,
        analysisState: 'loading',
        analysisError: null,
      };
    });
    multiCallsRef.current = initialStates;
    setMultiCalls(initialStates);

    await Promise.all(history.calls.map(async ({ phone, taskId: callTaskId }) => {
      try {
        const [task, transcriptRes, analysis] = await Promise.all([
          getTask(callTaskId),
          getTaskTranscript(callTaskId).catch(() => null),
          fetchAnalysisWithRetry(callTaskId),
        ]);

        const transcriptEntries: MultiCallTranscriptEntry[] = (transcriptRes?.turns || []).map((turn) => ({
          id: `${Date.now()}-${Math.random()}`,
          role: turn.speaker === 'agent' ? 'agent' : 'caller',
          text: turn.content,
        }));

        updateMultiCall(phone, {
          taskId: callTaskId,
          status: task.status as MultiCallEventStatus,
          transcript: transcriptEntries.length > 0
            ? transcriptEntries
            : [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: 'No transcript saved' }],
          analysis: analysis ?? null,
          analysisState: analysis ? 'ready' : 'error',
          analysisError: analysis ? null : 'Summary unavailable',
          thinking: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        updateMultiCall(phone, {
          status: 'failed',
          transcript: [{ id: `${Date.now()}-${Math.random()}`, role: 'status', text: `Failed to load call: ${message}` }],
          analysis: null,
          analysisState: 'error',
          analysisError: message,
          thinking: false,
        });
      }
    }));
    await loadMultiSummary(history.calls.map((call) => call.taskId), history.objective);
  }

  function looksLikePhone(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 10;
  }

  function resolvePhoneFromTextOrManual(text: string): string | null {
    const parsedPhones = parsePhonesFromText(text);
    if (parsedPhones.length === 1) return parsedPhones[0];
    if (manualPhones.length === 1) return manualPhones[0];
    return null;
  }

  function promptManualPhoneSelection() {
    if (manualPhones.length > 1) {
      addMessage({ role: 'ai', text: 'I can only place one call at a time. Tap Call on one of your manual numbers below.' });
      return;
    }
    addMessage({ role: 'ai', text: 'Please enter a valid US phone number, like (650) 555-1212.' });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || typing) return;

    addMessage({ role: 'user', text });
    setInput('');

    if (phase === 'objective') {
      const objectiveText = text.trim();
      setObjective(objectiveText);

      if (concurrentTestMode) {
        const phonesFromText = parsePhonesFromText(text);
        const requestedCount = extractConcurrentCountFromText(text);
        const desiredCount = clampConcurrentCount(requestedCount ?? concurrentTargetCount);
        if (requestedCount !== null) {
          setConcurrentTargetCount(desiredCount);
        }
        if (phonesFromText.length > 0) {
          setManualPhones((prev) => Array.from(new Set([...prev, ...phonesFromText])));
        }
        let targetPhones = Array.from(new Set([...manualPhones, ...phonesFromText]));
        const targetDirectory: Record<string, MultiCallTargetMeta> = { ...multiCallTargets };
        targetPhones.forEach((phone) => {
          if (!targetDirectory[phone]) {
            targetDirectory[phone] = { phone, source: 'manual', title: null, url: null, snippet: null };
          }
        });

        if (autoSourceNumbers && targetPhones.length < desiredCount) {
          addMessage({
            role: 'status',
            text: `Exa is finding phone numbers for ${desiredCount} concurrent call${desiredCount === 1 ? '' : 's'}...`,
          });
          const searchQuery = userLocation
            ? `${objectiveText} ${userLocation} phone number`
            : `${objectiveText} phone number`;
          try {
            const lookupLimit = Math.max(12, desiredCount * 6);
            const research = await searchResearch(searchQuery, lookupLimit);
            if (research.ok && research.results.length > 0) {
              const discoveredTargets = collectTargetsFromResearch(research.results, desiredCount * 2);
              if (discoveredTargets.length > 0) {
                const discoveredPhones = discoveredTargets.map((item) => item.phone);
                targetPhones = Array.from(new Set([...targetPhones, ...discoveredPhones]));
                setManualPhones((prev) => Array.from(new Set([...prev, ...discoveredPhones])));
                setMultiCallTargets((prev) => {
                  const next = { ...prev };
                  discoveredTargets.forEach((item) => {
                    const targetMeta: MultiCallTargetMeta = {
                      phone: item.phone,
                      source: 'exa',
                      title: item.title,
                      url: item.url,
                      snippet: item.snippet,
                    };
                    next[item.phone] = targetMeta;
                    targetDirectory[item.phone] = targetMeta;
                  });
                  return next;
                });
                addMessage({
                  role: 'status',
                  text: `Exa found ${discoveredPhones.length} usable number${discoveredPhones.length === 1 ? '' : 's'} across ${research.results.length} place${research.results.length === 1 ? '' : 's'}.`,
                });
              } else {
                addMessage({
                  role: 'status',
                  text: 'Exa found results, but none had valid US phone numbers.',
                });
              }
            } else {
              addMessage({
                role: 'status',
                text: 'Exa did not return phone-ready results for this objective.',
              });
            }
          } catch {
            addMessage({
              role: 'status',
              text: 'Auto number discovery failed. You can still add numbers manually.',
            });
          }
        }

        if (targetPhones.length === 0) {
          setPhase('phone');
          addMessage({
            role: 'ai',
            text: autoSourceNumbers
              ? 'I could not auto-find valid US numbers. Add numbers manually and send again.'
              : 'Add manual numbers first, then send your objective to start concurrent test calls.',
          });
          return;
        }
        if (targetPhones.length < desiredCount) {
          addMessage({
            role: 'status',
            text: `Only found ${targetPhones.length} valid number${targetPhones.length === 1 ? '' : 's'}. Starting with available numbers.`,
          });
        }
        const selectedPhones = targetPhones.slice(0, desiredCount);
        const selectedTargets = selectedPhones.reduce<Record<string, MultiCallTargetMeta>>((acc, phone) => {
          const fromState = targetDirectory[phone];
          acc[phone] = fromState ?? { phone, source: 'manual', title: null, url: null, snippet: null };
          return acc;
        }, {});
        await startConcurrentTestCalls(selectedPhones, objectiveText, concurrentRunMode, undefined, selectedTargets);
        return;
      }

      // If the user already included a phone number, skip discovery and use it directly.
      // Still fire Exa in the background for research context.
      if (looksLikePhone(text)) {
        const parsedPhones = parsePhonesFromText(text);
        if (parsedPhones.length > 1) {
          setManualPhones((prev) => Array.from(new Set([...prev, ...parsedPhones])));
          setPhase('phone');
          addMessage({ role: 'ai', text: `I found ${parsedPhones.length} numbers. Pick one from the manual list below, or add more.` });
          return;
        }
        const phone = parsedPhones[0];
        if (!phone) {
          // Numeric-looking objective text can contain many non-phone digits.
          // Treat it as objective text and continue to discovery/phone flow.
        } else {
          setPhoneNumber(phone);

          // Fire research in the background for context (don't block the call)
          const searchQuery = userLocation ? `${text} near ${userLocation}` : text;
          searchResearch(searchQuery)
            .then((res) => {
              if (res.ok && res.count > 0) {
                const snippets = res.results
                  .filter((r) => r.snippet)
                  .map((r) => `${r.title ?? ''}: ${r.snippet}`)
                  .join('\n');
                setResearchContext(snippets);
              }
            })
            .catch(() => {}); // Research is best-effort

          startNegotiation(phone, objectiveText);
          return;
        }
      }

      // No phone number — show typing while researching
      setTyping(true);

      const searchQuery = userLocation ? `${text} near ${userLocation}` : text;
      searchResearch(searchQuery)
        .then((res) => {
          setTyping(false);

          if (res.ok && res.count > 0) {
            // Build research context from all results
            const snippets = res.results
              .filter((r) => r.snippet)
              .map((r) => `${r.title ?? ''}: ${r.snippet}`)
              .join('\n');
            setResearchContext(snippets);

            // Check if any results have phone numbers
            const withPhones = res.results.filter((r) => r.phone_numbers && r.phone_numbers.length > 0);

            if (withPhones.length > 0) {
              setDiscoveryResults(res.results);
              addMessage({
                role: 'ai',
                text: `I found ${withPhones.length} business${withPhones.length === 1 ? '' : 'es'} you can call directly. Pick one, or enter your own number.`,
              });
              addMessage({
                role: 'search-results',
                text: '',
                searchResults: res.results,
              });
              setPhase('discovery');
              return;
            }

            // Results but no phone numbers — fall through to phone phase
            addMessage({ role: 'status', text: `Found ${res.count} relevant result${res.count === 1 ? '' : 's'} for context` });
          }

          // Default: ask for phone
          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        })
        .catch(() => {
          setTyping(false);
          // Research failed/disabled — ask for phone
          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        });
    } else if (phase === 'discovery') {
      // In discovery, if user types a phone number, use it
      if (looksLikePhone(text)) {
        const parsedPhones = parsePhonesFromText(text);
        if (parsedPhones.length > 1) {
          setManualPhones((prev) => Array.from(new Set([...prev, ...parsedPhones])));
          addMessage({ role: 'ai', text: `Added ${parsedPhones.length} numbers. Tap Call on the one you want.` });
          return;
        }
        const phone = resolvePhoneFromTextOrManual(text);
        if (!phone) {
          promptManualPhoneSelection();
          return;
        }
        setPhoneNumber(phone);
        startNegotiation(phone);
      } else {
        // Treat as a new search or just move to phone phase
        setPhase('phone');
        aiReply("What's the phone number I should call?", 400);
      }
    } else if (phase === 'phone') {
      const parsedPhones = parsePhonesFromText(text);
      if (parsedPhones.length > 1) {
        setManualPhones((prev) => Array.from(new Set([...prev, ...parsedPhones])));
        addMessage({ role: 'ai', text: `Added ${parsedPhones.length} numbers. Tap Call on the one you want.` });
        return;
      }
      const phone = resolvePhoneFromTextOrManual(text);
      if (!phone) {
        promptManualPhoneSelection();
        return;
      }
      setPhoneNumber(phone);
      startNegotiation(phone);
    } else if (phase === 'active') {
      aiReply("I'm currently on the call negotiating. I'll keep you posted on progress.", 400);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSend();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const inputDisabled = phase === 'connecting';
  const hasLiveMultiCall = Object.values(multiCalls).some(
    (state) => state.status === 'dialing' || state.status === 'connected' || state.status === 'media_connected' || state.status === 'active',
  );
  const isOnCall = concurrentTestMode ? hasLiveMultiCall : (phase === 'active' || (phase === 'connecting' && callStatus === 'active'));
  const canControlSingleCall = Boolean(
    !concurrentTestMode
    && taskId
    && (callStatus === 'active' || phase === 'active' || phase === 'connecting'),
  );
  const showNewNegotiation = phase === 'ended' && (analysisLoaded || (concurrentTestMode && Object.keys(multiCalls).length > 0));
  const multiCallEntries = Object.entries(multiCalls).sort(([phoneA], [phoneB]) => phoneA.localeCompare(phoneB));
  const multiTargetEntries = multiCallEntries.map(([phone]) => {
    const target = multiCallTargets[phone];
    return {
      phone,
      target: target ?? { phone, source: 'manual' as const, title: null, url: null, snippet: null },
    };
  });
  const multiSummaryTaskIds = multiCallEntries
    .map(([, state]) => state.taskId)
    .filter((id): id is string => Boolean(id));
  const groupedRuns = new Map<string, TaskSummary[]>();
  pastTasks.forEach((task) => {
    if (!task.run_id) return;
    const bucket = groupedRuns.get(task.run_id) ?? [];
    bucket.push(task);
    groupedRuns.set(task.run_id, bucket);
  });
  const backendRunEntries: MultiCallHistoryEntry[] = Array.from(groupedRuns.entries()).map(([runId, tasks]) => {
    const sorted = [...tasks].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return {
      id: runId,
      objective: sorted[0]?.objective ?? '',
      createdAt: sorted[0]?.created_at ?? new Date().toISOString(),
      mode: sorted[0]?.run_mode === 'real' ? 'real' : 'test',
      calls: sorted.map((task) => ({ phone: task.target_phone, taskId: task.id })),
    };
  });
  const multiRunEntryMap = new Map<string, MultiCallHistoryEntry>();
  backendRunEntries.forEach((entry) => multiRunEntryMap.set(entry.id, entry));
  multiHistory.forEach((entry) => {
    const existing = multiRunEntryMap.get(entry.id);
    if (existing) {
      multiRunEntryMap.set(entry.id, {
        ...existing,
        ...entry,
        calls: entry.calls.length > 0 ? entry.calls : existing.calls,
      });
    } else {
      multiRunEntryMap.set(entry.id, entry);
    }
  });
  const multiRunEntries = Array.from(multiRunEntryMap.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const multiRunTaskIds = new Set(multiRunEntries.flatMap((entry) => entry.calls.map((call) => call.taskId)));
  const filteredPastTasks = pastTasks.filter((task) => !task.run_id && !multiRunTaskIds.has(task.id));

  const outcomeDot: Record<CallOutcome, string> = {
    success: 'bg-emerald-500', partial: 'bg-amber-500', failed: 'bg-red-500', walkaway: 'bg-red-500', unknown: 'bg-gray-300',
  };

  const placeholderText = inputDisabled
    ? 'Setting up your negotiation...'
    : concurrentTestMode && phase === 'objective'
      ? 'Describe the objective (e.g., "3 concurrent voice agents to compare pricing")...'
    : phase === 'discovery'
      ? 'Or type a phone number...'
      : phase === 'phone'
        ? 'Enter the phone number...'
        : phase === 'active'
          ? 'Send a note...'
          : phase === 'ended'
            ? 'Negotiation complete'
            : 'Describe what you want to negotiate...';

  return (
    <div className="flex h-screen bg-[#fafaf9]">
      {/* ── Left Sidebar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="shrink-0 h-full bg-white border-r border-gray-200/60 flex flex-col overflow-hidden"
          >
            {/* Sidebar header */}
            <div className="px-3 pt-3.5 pb-2 shrink-0">
              <button
                onClick={handleNewNegotiation}
                className="w-full flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] font-medium text-gray-700 shadow-soft hover:shadow-card hover:border-gray-300 active:scale-[0.98] transition-all duration-150"
              >
                <Plus size={14} />
                New negotiation
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <div className="px-2 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent</span>
              </div>
              {filteredPastTasks.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">No past negotiations</p>
              ) : (
                <div className="space-y-0.5">
                  {filteredPastTasks.map((t) => {
                    const isActive = t.id === taskId;
                    const dot = outcomeDot[t.outcome] ?? 'bg-gray-300';
                    return (
                      <button
                        key={t.id}
                        onClick={() => loadPastChat(t.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 text-[13px] transition-all duration-150 group ${
                          isActive
                            ? 'bg-gray-100 text-gray-900 shadow-soft'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                        title={t.objective}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot} transition-colors`} />
                          <span className="truncate flex-1 font-medium">{t.objective || 'Untitled'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 ml-3.5">
                          <span className="text-[10px] text-gray-400">{t.outcome}</span>
                          {t.duration_seconds > 0 && (
                            <span className="text-[10px] text-gray-300">{t.duration_seconds < 60 ? `${t.duration_seconds}s` : `${Math.floor(t.duration_seconds / 60)}m`}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {multiRunEntries.length > 0 && (
                <>
                  <div className="px-2 pt-4 pb-1.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Multi-Run</span>
                  </div>
                  <div className="space-y-0.5">
                    {multiRunEntries.map((entry) => {
                      const isActive = activeMultiHistoryId === entry.id;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => loadMultiHistoryChat(entry.id)}
                          className={`w-full text-left rounded-lg px-3 py-2 text-[13px] transition-all duration-150 ${
                            isActive
                              ? 'bg-gray-100 text-gray-900 shadow-soft'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                          }`}
                          title={entry.objective}
                        >
                          <div className="truncate font-medium">{entry.objective || 'Concurrent run'}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                            <span>{entry.calls.length} call{entry.calls.length === 1 ? '' : 's'}</span>
                            <span>•</span>
                            <span>{(entry.mode ?? 'test') === 'real' ? 'real' : 'test'}</span>
                            <span>•</span>
                            <span>chat {entry.id.slice(0, 8)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sidebar footer */}
            <div className="shrink-0 border-t border-gray-100 px-3 py-2.5 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors duration-150">
                <BarChart3 size={13} />
                Dashboard
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between mx-4 mt-3 rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-soft px-5 py-3 shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600"
              >
                <PanelLeft size={16} />
              </button>
            )}
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <span
              className="text-[28px] tracking-tight text-gray-950 italic"
              style={{ fontFamily: '"Martina Plantijn", Georgia, serif' }}
            >
              kiru
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isOnCall && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease }}
                className="flex items-center gap-2"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-600">On call</span>
              </motion.div>
            )}
            {isOnCall && (
              <button
                onClick={handleEndCall}
                className="rounded-full bg-red-50 px-3.5 py-1.5 text-[12px] font-medium text-red-600 transition-all duration-150 hover:bg-red-100 active:scale-[0.97]"
              >
                End call
              </button>
            )}
          </div>
        </header>

        {/* Readiness warning banner */}
        {readinessWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-100 px-4 py-2"
          >
            <AlertTriangle size={13} className="text-amber-500" />
            <span className="text-[12px] text-amber-700">{readinessWarning}</span>
          </motion.div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-8 space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  {msg.role === 'analysis' && msg.analysisData ? (
                    <AnalysisCard analysis={msg.analysisData} />
                  ) : msg.role === 'audio' && msg.audioTaskId ? (
                    <AudioPlayer taskId={msg.audioTaskId} />
                  ) : msg.role === 'search-results' && msg.searchResults ? (
                    <div className="py-1">
                      <SearchResultCards
                        results={msg.searchResults}
                        onCall={handleCallFromSearch}
                        onSkip={handleSkipDiscovery}
                      />
                    </div>
                  ) : msg.role === 'status' ? (
                    <div className="flex justify-center py-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/50 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-soft">
                        <Phone size={9} className="text-gray-400" />
                        {msg.text}
                      </span>
                    </div>
                  ) : msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-card">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start items-start gap-2.5">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center mt-0.5 shadow-soft">
                        <span className="text-[10px] font-serif italic text-gray-300">k</span>
                      </div>
                      <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-2.5 text-[14px] leading-relaxed text-gray-900 shadow-soft">
                        {msg.text}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {concurrentTestMode && multiCallEntries.length > 0 && (
              <div className="pt-3">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Concurrent conversations
                </div>
                <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-soft">
                  <div className="text-[12px] font-semibold text-gray-900">Call Targets</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {multiTargetEntries.map(({ phone, target }) => (
                      <div key={`target-${phone}`} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-[11.5px] font-semibold text-gray-800">
                            {target.title || formatPhone(phone)}
                          </div>
                          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600">
                            {target.source === 'exa' ? 'Exa' : 'Manual'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-600">{formatPhone(phone)}</div>
                        {target.url && (
                          <a
                            href={target.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 block truncate text-[10.5px] text-blue-600 hover:text-blue-700"
                          >
                            {target.url}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-semibold text-gray-900">Combined Decision Summary</div>
                    {multiSummaryState === 'ready' && multiSummary?.recommended_phone && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Best: {formatPhone(multiSummary.recommended_phone)}
                      </span>
                    )}
                  </div>
                  {multiSummaryState === 'loading' && (
                    <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                      Building one detailed recommendation across all calls...
                    </div>
                  )}
                  {multiSummaryState === 'error' && (
                    <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                      <div className="text-[12px] text-red-700">
                        Combined summary unavailable: {multiSummaryError || 'Unknown error'}
                      </div>
                      {multiSummaryTaskIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { void loadMultiSummary(multiSummaryTaskIds, objective, true); }}
                          className="mt-2 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          Retry summary
                        </button>
                      )}
                    </div>
                  )}
                  {multiSummary && multiSummaryState === 'ready' && (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Recommendation</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-800">{multiSummary.recommended_option}</p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">{multiSummary.decision_rationale}</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Cross-call Summary</div>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-gray-700">{multiSummary.overall_summary}</p>
                      </div>
                      {multiSummary.price_comparison?.length > 0 && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Price + Terms</div>
                          <div className="mt-1 space-y-2">
                            {multiSummary.price_comparison.map((item) => (
                              <div key={item.task_id} className="rounded-lg border border-gray-100 bg-white px-2.5 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[11.5px] font-semibold text-gray-800">
                                    {item.vendor || formatPhone(item.phone || '')}
                                  </div>
                                  <span className="text-[10px] text-gray-500">{item.confidence} confidence</span>
                                </div>
                                <div className="mt-1 text-[11px] text-gray-600">
                                  Prices: {item.quoted_prices?.length ? item.quoted_prices.join(' | ') : 'Not captured'}
                                </div>
                                {item.location && (
                                  <div className="mt-0.5 text-[11px] text-gray-600">Location: {item.location}</div>
                                )}
                                {item.discounts?.length > 0 && (
                                  <div className="mt-0.5 text-[11px] text-gray-600">Discounts: {item.discounts.join(' | ')}</div>
                                )}
                                {item.fees?.length > 0 && (
                                  <div className="mt-0.5 text-[11px] text-gray-600">Fees: {item.fees.join(' | ')}</div>
                                )}
                                {item.constraints?.length > 0 && (
                                  <div className="mt-0.5 text-[11px] text-gray-600">Constraints: {item.constraints.join(' | ')}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {multiSummary.important_facts?.length > 0 && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Important Facts</div>
                          <div className="mt-1 space-y-1">
                            {multiSummary.important_facts.map((fact, idx) => (
                              <div key={`fact-${idx}`} className="text-[11.5px] text-gray-700">• {fact}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {multiCallEntries.map(([phone, state]) => {
                    const callTarget = multiCallTargets[phone];
                    const statusLabel = MULTI_STATUS_LABEL[state.status] ?? state.status;
                    const statusClass =
                      state.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : state.status === 'ended'
                          ? 'bg-gray-100 text-gray-600 border-gray-200'
                          : state.status === 'failed'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200';
                    const canControlThisCall = Boolean(
                      state.taskId
                      && (state.status === 'dialing'
                        || state.status === 'connected'
                        || state.status === 'media_connected'
                        || state.status === 'active'),
                    );

                    return (
                      <div key={phone} className="rounded-2xl border border-gray-200 bg-white shadow-soft overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-gray-900">
                              {callTarget?.title || formatPhone(phone)}
                            </div>
                            <div className="text-[10.5px] text-gray-500">{formatPhone(phone)}</div>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="h-56 overflow-y-auto px-3 py-2 space-y-1.5">
                          {state.transcript.length === 0 ? (
                            <div className="text-[12px] text-gray-400">Waiting for call events...</div>
                          ) : (
                            state.transcript.map((entry) => (
                              <div key={entry.id}>
                                {entry.role === 'status' ? (
                                  <div className="flex justify-center">
                                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] text-gray-500">
                                      {entry.text}
                                    </span>
                                  </div>
                                ) : entry.role === 'caller' ? (
                                  <div className="flex justify-end">
                                    <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-gray-900 px-2.5 py-1.5 text-[12px] text-white">
                                      {entry.text}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-start">
                                    <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-900">
                                      {entry.text}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                          {state.thinking && (
                            <div className="flex justify-start">
                              <div className="rounded-xl rounded-tl-sm border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
                                Thinking...
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                          {canControlThisCall && state.taskId && (
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => { void handleTransferToPersonal(state.taskId, phone); }}
                                  disabled={!normalizePhone(personalHandoffNumber)}
                                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10.5px] font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Transfer
                                </button>
                                <input
                                  value={multiDtmfInputs[phone] ?? ''}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setMultiDtmfInputs((prev) => ({ ...prev, [phone]: next }));
                                  }}
                                  placeholder="DTMF (1w2)"
                                  className="min-w-[120px] flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[10.5px] text-gray-800 outline-none focus:border-gray-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const digits = multiDtmfInputs[phone] ?? '';
                                    void handleSendDtmf(state.taskId, digits, phone);
                                    setMultiDtmfInputs((prev) => ({ ...prev, [phone]: '' }));
                                  }}
                                  disabled={!(multiDtmfInputs[phone] ?? '').trim()}
                                  className="rounded-lg bg-gray-900 px-2 py-1 text-[10.5px] font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Send
                                </button>
                              </div>
                              <div className="mt-1 text-[10px] text-gray-500">
                                IVR tips: use `w` to wait and `#` for submit.
                              </div>
                            </div>
                          )}
                          {state.taskId && (state.status === 'ended' || state.status === 'failed') && (
                            <AudioPlayer taskId={state.taskId} />
                          )}
                          {state.analysisState === 'loading' && (
                            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                              Generating end-of-call summary...
                            </div>
                          )}
                          {state.analysisState === 'error' && state.analysisError && (
                            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                              Summary unavailable: {state.analysisError}
                            </div>
                          )}
                          {state.analysis && (
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-gray-700">Call Summary</span>
                                <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600">
                                  {state.analysis.outcome}
                                </span>
                              </div>
                              <p className="mt-1 text-[12px] text-gray-700 leading-relaxed">
                                {state.analysis.summary}
                              </p>
                              {state.analysis.key_moments?.length > 0 && (
                                <div className="mt-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">What it learned</div>
                                  <div className="mt-1 space-y-1">
                                    {state.analysis.key_moments.slice(0, 3).map((moment, idx) => (
                                      <div key={`${phone}-moment-${idx}`} className="text-[11px] text-gray-600">
                                        • {moment}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {typing && !concurrentTestMode && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
                className="flex justify-start items-start gap-2.5"
              >
                <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center mt-0.5 shadow-soft">
                  <span className="text-[10px] font-serif italic text-gray-300">k</span>
                </div>
                <div className="rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-3 shadow-soft">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce-dot"
                        style={{ animationDelay: `${i * 0.16}s` }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Post-call actions */}
            {showNewNegotiation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease }}
                className="flex justify-center gap-2.5 pt-3"
              >
                {objective && phoneNumber && (
                  <button
                    onClick={() => {
                      closeAllSockets();
                      setMessages([
                        { id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' },
                        { id: `obj-${Date.now()}`, role: 'user', text: objective },
                        { id: `ai-phone-${Date.now()}`, role: 'ai', text: "Got it. What's the phone number I should call?" },
                        { id: `phone-${Date.now()}`, role: 'user', text: phoneNumber },
                      ]);
                      setInput('');
                      setTyping(false);
                      setTaskId(null);
                      setSessionId(null);
                      setCallStatus('pending');
                      setResearchContext('');
                      setAnalysisLoaded(false);
                      setDiscoveryResults([]);
                      setManualPhones([]);
                      setManualPhoneInput('');
                      setConcurrentTestMode(false);
                      setMultiCallTargets({});
                      setMultiCalls({});
                      multiCallsRef.current = {};
                      multiEndedAnnouncedRef.current = false;
                      analysisLoadedRef.current = false;
                      startNegotiation(phoneNumber);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 shadow-soft transition-all duration-150 hover:shadow-card hover:border-gray-300 active:scale-[0.97]"
                  >
                    <Phone size={13} />
                    Call again
                  </button>
                )}
                <button
                  onClick={handleNewNegotiation}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 shadow-soft transition-all duration-150 hover:shadow-card hover:border-gray-300 active:scale-[0.97]"
                >
                  <RotateCcw size={13} />
                  New negotiation
                </button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-200/60 bg-white/80 backdrop-blur-xl px-5 py-3.5">
          <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
            {phase === 'objective' && !inputDisabled && (
              <div className="mb-2.5 rounded-xl border border-gray-200 bg-white p-2.5 shadow-soft">
                <label className="inline-flex items-center gap-2 text-[12.5px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={concurrentTestMode}
                    onChange={(e) => setConcurrentTestMode(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-0"
                  />
                  Concurrent mode (dial multiple users at once)
                </label>
                <p className="mt-1 text-[11.5px] text-gray-500">
                  Choose test or real mode, enter an objective, then start concurrent calls.
                </p>
                {concurrentTestMode && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
                      <button
                        type="button"
                        onClick={() => setConcurrentRunMode('test')}
                        className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${
                          concurrentRunMode === 'test'
                            ? 'bg-white text-gray-900 shadow-soft'
                            : 'text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        Test mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setConcurrentRunMode('real')}
                        className={`rounded-md px-2 py-1 text-[11.5px] font-medium ${
                          concurrentRunMode === 'real'
                            ? 'bg-white text-gray-900 shadow-soft'
                            : 'text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        Real mode
                      </button>
                    </div>
                    <label className="inline-flex items-center gap-2 text-[12px] text-gray-700">
                      <span>Concurrent agents</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_CONCURRENT_TEST_CALLS}
                        value={concurrentTargetCount}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value || '1', 10);
                          setConcurrentTargetCount(clampConcurrentCount(parsed));
                        }}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[12px] text-gray-800 outline-none focus:border-gray-300"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-[12px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={autoSourceNumbers}
                        onChange={(e) => setAutoSourceNumbers(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-0"
                      />
                      Auto-find numbers with Exa
                    </label>
                  </div>
                )}
                <div className="mt-2.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    Personal Handoff Number (Optional)
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={personalHandoffNumber}
                      onChange={(e) => setPersonalHandoffNumber(e.target.value)}
                      placeholder="+16505551212"
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-800 outline-none focus:border-gray-300"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    During a live call, you can hand off to this number or send keypad digits for IVR menus.
                  </p>
                </div>
              </div>
            )}
            {concurrentTestMode && (phase === 'discovery' || phase === 'phone' || phase === 'objective') && !inputDisabled && (
              <div className="mb-2.5 rounded-xl border border-gray-200 bg-white p-2.5 shadow-soft">
                <div className="flex items-center gap-2">
                  <input
                    value={manualPhoneInput}
                    onChange={(e) => setManualPhoneInput(e.target.value)}
                    placeholder={concurrentTestMode ? `Add ${concurrentRunMode === 'real' ? 'real targets' : 'test participants'} (comma/newline separated)` : 'Add manual numbers (comma/newline separated)'}
                    className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-gray-800 outline-none focus:border-gray-300"
                  />
                  <button
                    type="button"
                    onClick={handleManualAdd}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-gray-700"
                  >
                    Add
                  </button>
                </div>
                {concurrentTestMode && phase === 'objective' && (
                  <p className="mt-1.5 text-[11.5px] text-gray-500">
                    Tip: {concurrentRunMode === 'real' ? 'real' : 'test'} mode supports prompts like &quot;3 concurrent voice agents&quot;. Exa can auto-fill numbers.
                  </p>
                )}
                {manualPhones.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {manualPhones.map((phone) => (
                      <div key={phone} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => handleManualCall(phone)}
                          className="text-[11.5px] font-medium text-gray-700 hover:text-gray-900"
                        >
                          {formatPhone(phone)}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveManualPhone(phone)}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={`Remove ${phone}`}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {canControlSingleCall && taskId && (
              <div className="mb-2.5 rounded-xl border border-gray-200 bg-white p-2.5 shadow-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleTransferToPersonal(taskId); }}
                    disabled={!normalizePhone(personalHandoffNumber)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Transfer to my number
                  </button>
                  <input
                    value={singleDtmfInput}
                    onChange={(e) => setSingleDtmfInput(e.target.value)}
                    placeholder="Send keypad digits (e.g., 1w2)"
                    className="min-w-[170px] flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-800 outline-none focus:border-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSendDtmf(taskId, singleDtmfInput);
                      setSingleDtmfInput('');
                    }}
                    disabled={!singleDtmfInput.trim()}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send DTMF
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Use this when calls hit an automated phone menu. `w` inserts a short wait between digits.
                </p>
              </div>
            )}
            <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-soft transition-all duration-200 focus-within:border-gray-300 focus-within:shadow-card">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholderText}
                disabled={inputDisabled || phase === 'ended'}
                rows={1}
                className="flex-1 resize-none bg-transparent text-[14px] text-gray-900 placeholder-gray-400 outline-none disabled:text-gray-400"
                style={{ maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || inputDisabled || typing || phase === 'ended'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-soft transition-all duration-150 hover:bg-gray-700 hover:shadow-card active:scale-[0.93] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
