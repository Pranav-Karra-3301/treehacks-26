export type CallStatus = 'pending' | 'dialing' | 'active' | 'ended' | 'failed';
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
  | { type: 'call_status'; data: { status: CallStatus }; timestamp?: string }
  | { type: 'transcript_update'; data: { speaker: 'caller' | 'agent'; content: string; created_at?: string }; timestamp?: string }
  | { type: 'agent_thinking'; data: { delta: string }; timestamp?: string }
  | { type: 'strategy_update'; data: { strategy: string; tactics?: string[] }; timestamp?: string }
  | { type: 'audio_level'; data: { level: number }; timestamp?: string }
  | { type: 'analysis_ready'; data: { task_id: string }; timestamp?: string };

export type TranscriptResponse = {
  task_id: string;
  turns: TranscriptEntry[];
};
