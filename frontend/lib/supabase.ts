import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Avoid "supabaseUrl is required" during build when env vars are unset (e.g. Vercel without envs).
// Use explicit fallbacks so createClient is never called with undefined or empty string.
const supabaseUrl =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' && process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
    : 'https://placeholder.supabase.co';
const supabaseAnonKey =
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()
    : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types matching Supabase table schemas ──────────────────────────────────────

export type SupabaseCall = {
  id: string;
  task_type: string | null;
  target_phone: string | null;
  objective: string | null;
  context: string | null;
  run_id: string | null;
  run_mode: string | null;
  location: string | null;
  target_name: string | null;
  target_url: string | null;
  target_source: string | null;
  target_snippet: string | null;
  target_outcome: string | null;
  walkaway_point: string | null;
  agent_persona: string | null;
  opening_line: string | null;
  style: string | null;
  status: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
};

export type SupabaseCallArtifact = {
  task_id: string;
  transcript_json: TranscriptTurn[] | null;
  analysis_json: SupabaseAnalysis | null;
  recording_json: Record<string, unknown> | null;
  audio_payload_json: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type TranscriptTurn = {
  speaker: 'caller' | 'agent';
  content: string;
  created_at?: string | number;
};

export type SupabaseAnalysis = {
  summary?: string;
  outcome?: string;
  outcome_reasoning?: string;
  concessions?: Array<{ party: string; description: string; significance?: string }>;
  tactics_used?: Array<{ name: string; description?: string; effectiveness?: string }>;
  score?: number;
  score_reasoning?: string;
  rapport_quality?: string;
  key_moments?: string[];
  improvement_suggestions?: string[];
};

export type SupabaseChatSession = {
  id: string;
  mode: string | null;
  revision: number | null;
  run_id: string | null;
  task_ids_json: string[] | null;
  payload_json: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};
