export type CallStatus = 'pending' | 'dialing' | 'active' | 'ended' | 'failed';

export type TranscriptEntry = {
  speaker: 'caller' | 'agent';
  content: string;
  created_at: string;
};

export type TaskSummary = {
  id: string;
  task_type: 'bill_reduction' | 'price_negotiation' | 'custom';
  target_phone: string;
  objective: string;
  status: CallStatus;
  outcome: 'unknown' | 'success' | 'partial' | 'failed' | 'walkaway';
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
  style: 'collaborative' | 'assertive' | 'empathetic';
};

export type CallEvent = {
  type: 'call_status' | 'transcript_update' | 'agent_thinking' | 'strategy_update' | 'audio_level' | 'analysis_ready';
  data: Record<string, unknown>;
  timestamp?: string;
};
