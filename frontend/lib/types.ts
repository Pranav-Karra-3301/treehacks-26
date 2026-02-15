export type CallStatus =
  | 'pending'
  | 'dialing'
  | 'connected'
  | 'media_connected'
  | 'active'
  | 'disconnected'
  | 'ended'
  | 'failed'
  | 'mark';
export type CallOutcome = 'unknown' | 'success' | 'partial' | 'failed' | 'walkaway';
export type NegotiationStyle = 'collaborative' | 'assertive' | 'empathetic';

export type TranscriptEntry = {
  speaker: 'caller' | 'agent';
  content: string;
  created_at: string;
};

export type TaskSummary = {
  id: string;
  task_type: string;
  target_phone: string;
  objective: string;
  run_id?: string | null;
  run_mode?: 'test' | 'real' | null;
  status: CallStatus;
  outcome: CallOutcome;
  duration_seconds: number;
  created_at: string;
  ended_at: string | null;
};

export type TaskDetail = TaskSummary & {
  context: string;
  target_outcome?: string | null;
  walkaway_point?: string | null;
  agent_persona?: string | null;
  opening_line?: string | null;
  style: NegotiationStyle;
};

export type Concession = {
  party: string;
  description: string;
  significance: string;
};

export type TacticUsed = {
  name: string;
  description: string;
  effectiveness: string;
};

export type AnalysisPayload = {
  summary: string;
  outcome: CallOutcome;
  outcome_reasoning: string;
  concessions: Concession[];
  tactics: string[];
  tactics_used: TacticUsed[];
  score: number;
  score_reasoning: string;
  rapport_quality: string;
  key_moments: string[];
  improvement_suggestions: string[];
  details: Record<string, unknown>;
};

export type VoiceReadiness = {
  twilio_configured: boolean;
  twilio_webhook_public?: boolean;
  twilio_webhook_reason?: string | null;
  deepgram_configured: boolean;
  llm_ready: boolean;
  llm_provider: string;
  deepgram_voice_agent_enabled: boolean;
  exa_search_enabled: boolean;
  cache_enabled: boolean;
  cache_ready: boolean;
  can_dial_live: boolean;
};

export type BusinessResult = {
  title: string | null;
  url: string | null;
  snippet: string | null;
  published: string | null;
  score: number | null;
  phone_numbers: string[];
  highlights: string[];
};

export type ResearchResponse = {
  ok: boolean;
  enabled: boolean;
  query: string;
  count: number;
  results: BusinessResult[];
  reason: string | null;
};

export type RecordingMetadata = {
  task_id: string;
  status: string;
  files: Record<string, { exists: boolean; size_bytes: number }>;
};

export type ActionResponse = {
  ok: boolean;
  message: string;
  session_id: string | null;
};

// Discriminated union for WebSocket events
export type CallEvent =
  | {
      type: 'call_status';
      data: {
        status: CallStatus;
        action?: string;
        digits?: string;
        error?: string;
        target_phone?: string;
        stream_sid?: string;
        session_id?: string;
      };
      timestamp?: string;
    }
  | { type: 'transcript_update'; data: { speaker: 'caller' | 'agent'; content: string; created_at?: string }; timestamp?: string }
  | { type: 'agent_thinking'; data: { delta: string }; timestamp?: string }
  | { type: 'strategy_update'; data: { strategy: string; tactics?: string[] }; timestamp?: string }
  | { type: 'audio_level'; data: { level: number }; timestamp?: string }
  | { type: 'analysis_ready'; data: { task_id: string }; timestamp?: string };

export type TranscriptResponse = {
  task_id: string;
  turns: TranscriptEntry[];
};

// Telemetry types
export type TelemetryEvent = {
  timestamp?: string;
  started_at?: string;
  component: string;
  action: string;
  status: string;
  task_id?: string | null;
  session_id?: string | null;
  duration_ms?: number | null;
  error?: string | null;
  details?: Record<string, unknown>;
};

export type TelemetryRecentResponse = {
  count: number;
  events: TelemetryEvent[];
};

export type ComponentStats = {
  count: number;
  ok: number;
  error: number;
  avg_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
};

export type TelemetrySummaryResponse = {
  event_count: number;
  component_count: number;
  action_count: number;
  slowest_events: TelemetryEvent[];
  durations_ms: {
    count: number;
    avg_ms: number | null;
    min_ms: number | null;
    max_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    p99_ms: number | null;
  };
  components: Record<string, ComponentStats>;
  actions: Record<string, ComponentStats>;
};

// Feat-branch recording types (detailed metadata for local LLM data explorer)
export type RecordingFileStat = {
  exists: boolean;
  size_bytes: number;
};

export type CallRecordingMetadata = {
  task_id: string;
  status?: string;
  started_at?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number;
  bytes_by_side: {
    caller: number;
    agent: number;
    mixed: number;
  };
  chunks_by_side: {
    caller: number;
    agent: number;
  };
  last_chunk_at: string | null;
  transcript_turns?: number;
  last_turn_at?: string | null;
  call_sid?: string | null;
  stream_sid?: string | null;
  stop_reason?: string;
  deepgram?: {
    audio_chunks_sent?: number;
    audio_bytes_sent?: number;
    audio_chunks_received?: number;
    audio_bytes_received?: number;
    messages_received?: number;
  };
  files?: Record<string, RecordingFileStat>;
};

export type CallRecordingFiles = {
  task_id: string;
  files: Record<string, RecordingFileStat>;
};

export type TaskTranscriptPayload = {
  task_id: string;
  turns: TranscriptEntry[];
  count: number;
};

export type MultiCallPriceComparison = {
  task_id: string;
  phone: string;
  vendor: string | null;
  location?: string | null;
  quoted_prices: string[];
  discounts: string[];
  fees: string[];
  constraints: string[];
  key_takeaways: string[];
  confidence: 'high' | 'medium' | 'low' | string;
};

export type MultiCallSummaryPayload = {
  overall_summary: string;
  recommended_call_task_id: string | null;
  recommended_phone: string | null;
  recommended_option: string;
  decision_rationale: string;
  price_comparison: MultiCallPriceComparison[];
  important_facts: string[];
  missing_information: string[];
  next_best_actions: string[];
  generated_at?: string;
};

export type MultiCallSummaryResponse = {
  ok: boolean;
  call_count: number;
  summary: MultiCallSummaryPayload;
  checks?: {
    all_calls_terminal: boolean;
    active_calls: Array<{
      task_id: string;
      target_phone: string;
      status: string;
    }>;
    early_ended_calls: Array<{
      task_id: string;
      target_phone: string;
      status: string;
      reason: string;
    }>;
  };
  calls: Array<{
    task_id: string;
    target_phone: string;
    status: string;
    outcome: string;
    transcript_turn_count?: number;
    score: number;
  }>;
};

export type TelemetryEventsPayload = {
  count: number;
  events: TelemetryEvent[];
};

export type ChatSessionMode = 'single' | 'concurrent';

export type ChatSessionRecord = {
  session_id: string;
  mode: ChatSessionMode;
  revision: number;
  run_id?: string | null;
  task_ids: string[];
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
