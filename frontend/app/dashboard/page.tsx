'use client';

import { useState, useRef } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronDown,
  Phone,
  Clock,
  TrendingUp,
  BarChart3,
  Loader2,
  MessageSquare,
  Mic,
  User,
  Bot,
  X,
  Play,
  Target,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SupabaseCall, SupabaseCallArtifact, SupabaseAnalysis, TranscriptTurn } from '../../lib/supabase';
import { getAudioUrl } from '../../lib/api';

// ─── Design tokens ──────────────────────────────────────────────────────────────

type Outcome = 'success' | 'partial' | 'failed' | 'walkaway' | 'unknown';

const outcomeConfig: Record<Outcome, { bg: string; text: string; dot: string; label: string }> = {
  success:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Success' },
  partial:  { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Partial' },
  failed:   { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Failed' },
  walkaway: { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     label: 'Walk-away' },
  unknown:  { bg: 'bg-gray-100',   text: 'text-gray-500',    dot: 'bg-gray-400',    label: 'Unknown' },
};

const statusDot: Record<string, string> = {
  pending: 'bg-gray-300',
  dialing: 'bg-amber-400 animate-pulse',
  connected: 'bg-emerald-500 animate-pulse',
  active: 'bg-emerald-500 animate-pulse',
  ended: 'bg-gray-400',
  failed: 'bg-red-500',
};

const ease = [0.16, 1, 0.3, 1] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(s: number | null) {
  if (!s || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtUnixTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBarColor(score: number) {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getOutcome(s: string | null | undefined): Outcome {
  if (s && s in outcomeConfig) return s as Outcome;
  return 'unknown';
}

// ─── Scroll reveal ─────────────────────────────────────────────────────────────

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease }} className={className}>
      {children}
    </motion.div>
  );
}

// ─── Branded wordmark ──────────────────────────────────────────────────────────

function Kiru({ className = '' }: { className?: string }) {
  return (
    <span className={`italic ${className}`} style={{ fontFamily: '"Martina Plantijn", Georgia, serif' }}>
      kiru
    </span>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────────

type DetailData = {
  call?: SupabaseCall;
  analysis?: SupabaseAnalysis;
  transcript?: TranscriptTurn[];
};

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Fetch from Supabase via SWR ───────────────────────────────────────────
  const fetcher = async () => {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  };

  const { data: calls = [], isLoading: loading } = useSWR<SupabaseCall[]>('dashboard-calls', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailData>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'transcript' | 'analysis' | 'recording'>('transcript');

  // ── Open detail drawer ────────────────────────────────────────────────────

  async function openDetail(callId: string) {
    setSelectedId(callId);
    setDetailLoading(true);
    setDetailTab('transcript');
    setDetailData({});

    const [callRes, artifactRes] = await Promise.allSettled([
      supabase.from('calls').select('*').eq('id', callId).single(),
      supabase.from('call_artifacts').select('*').eq('task_id', callId).single(),
    ]);

    const call = callRes.status === 'fulfilled' && callRes.value.data ? callRes.value.data : undefined;
    const artifact: SupabaseCallArtifact | undefined = artifactRes.status === 'fulfilled' && artifactRes.value.data ? artifactRes.value.data : undefined;

    setDetailData({
      call,
      analysis: artifact?.analysis_json ?? undefined,
      transcript: artifact?.transcript_json ?? undefined,
    });
    setDetailLoading(false);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetailData({});
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const total = calls.length;
  const ended = calls.filter((c) => c.status === 'ended');
  const successes = ended.filter((c) => c.outcome === 'success').length;
  const rate = ended.length > 0 ? Math.round((successes / ended.length) * 100) : 0;
  const durations = ended.map((c) => c.duration_seconds).filter((d): d is number => d != null && d > 0);
  const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const active = calls.filter((c) => c.status === 'active' || c.status === 'dialing').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-3">
        <nav className="w-full max-w-5xl rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-soft">
          <div className="flex items-center justify-between px-6 h-14">
            <Link href="/" className="tracking-tight text-gray-950">
              <Kiru className="text-[28px] text-gray-950" />
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/how-it-works" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">How it works</Link>
              <span className="hidden sm:block text-[13px] text-gray-900 font-medium">Dashboard</span>
              <Link href="/chat" className="group inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-gray-800">
                Launch App <ArrowUpRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </nav>
      </div>

      {/* ── Hero heading ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 pt-16 pb-10">
        <Reveal>
          <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Dashboard</p>
          <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950">
            Your negotiations.{' '}
            <span className="font-serif italic font-normal">At a glance.</span>
          </h1>
        </Reveal>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-20">
        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            { label: 'Total Calls', value: loading ? '...' : String(total), sub: active > 0 ? `${active} active now` : undefined, icon: Phone, delay: 0.05 },
            { label: 'Success Rate', value: loading ? '...' : ended.length > 0 ? `${rate}%` : '—', sub: ended.length > 0 ? `${successes}/${ended.length} calls` : undefined, icon: TrendingUp, delay: 0.1 },
            { label: 'Avg Duration', value: loading ? '...' : avgDur > 0 ? fmtDuration(avgDur) : '—', sub: durations.length > 0 ? `across ${durations.length} calls` : undefined, icon: Clock, delay: 0.15 },
            { label: 'Completed', value: loading ? '...' : String(ended.length), sub: total > 0 ? `${Math.round((ended.length / total) * 100)}% of total` : undefined, icon: Target, delay: 0.2 },
          ].map((s) => (
            <Reveal key={s.label} delay={s.delay}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <s.icon size={14} className="text-gray-400" />
                  <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</span>
                </div>
                <p className="text-[28px] font-bold tracking-tight text-gray-950 tabular-nums leading-none">{s.value}</p>
                {s.sub ? <p className="text-[12px] text-gray-400 mt-2">{s.sub}</p> : null}
              </div>
            </Reveal>
          ))}
        </div>

        {/* ── Negotiations heading ───────────────────────────────────────── */}
        <Reveal delay={0.1}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[18px] font-semibold text-gray-950">Recent Negotiations</h2>
            {calls.length > 0 ? (
              <span className="text-[12px] text-gray-400">{calls.length} total</span>
            ) : null}
          </div>
        </Reveal>

        {/* ── Call list ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : calls.length === 0 ? (
          <Reveal delay={0.15}>
            <div className="rounded-2xl border border-gray-100 bg-gray-50/50 px-8 py-20 text-center">
              <Phone size={28} className="text-gray-200 mx-auto mb-4" />
              <p className="text-[16px] font-medium text-gray-400 mb-2">No negotiations yet</p>
              <p className="text-[13px] text-gray-300 mb-6 max-w-sm mx-auto">Start a negotiation from the app to see your results and analysis here.</p>
              <Link href="/chat" className="group inline-flex items-center gap-2 rounded-full bg-gray-950 pl-5 pr-4 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-gray-800 hover:shadow-card active:scale-[0.98]">
                Start negotiating <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="space-y-2">
            {calls.map((call, i) => (
              <CallRow key={call.id} call={call} index={i} onSelect={openDetail} />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Drawer ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedId ? (
          <DetailDrawer
            taskId={selectedId}
            data={detailData}
            loading={detailLoading}
            activeTab={detailTab}
            setActiveTab={setDetailTab}
            onClose={closeDetail}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Call Row ───────────────────────────────────────────────────────────────────

function CallRow({ call, index, onSelect }: { call: SupabaseCall; index: number; onSelect: (id: string) => void }) {
  const oc = outcomeConfig[getOutcome(call.outcome)];
  const dot = statusDot[call.status ?? ''] ?? 'bg-gray-300';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3), ease }}
      onClick={() => onSelect(call.id)}
      className="w-full text-left rounded-2xl border border-gray-100 bg-gray-50/50 px-6 py-5 hover:border-gray-200 hover:shadow-card hover:bg-white transition-all duration-200 group"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 80px' }}
    >
      <div className="flex items-center gap-4">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-gray-950 truncate group-hover:text-gray-900 transition-colors">
            {call.objective || 'Untitled negotiation'}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
            {call.target_phone ? (
              <span className="text-[11px] text-gray-400">{call.target_phone}</span>
            ) : null}
            {call.duration_seconds != null && call.duration_seconds > 0 ? (
              <span className="text-[11px] text-gray-400">{fmtDuration(call.duration_seconds)}</span>
            ) : null}
            {call.style ? (
              <span className="rounded-md bg-gray-100 border border-gray-200/60 px-2 py-0.5 text-[10px] font-medium text-gray-500">{call.style}</span>
            ) : null}
            {call.created_at ? (
              <span className="text-[11px] text-gray-300">{fmtDate(call.created_at)}</span>
            ) : null}
          </div>
        </div>
        <ChevronDown size={14} className="text-gray-300 -rotate-90 group-hover:text-gray-500 transition-colors shrink-0" />
      </div>
    </motion.button>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────────

function DetailDrawer({
  taskId,
  data,
  loading,
  activeTab,
  setActiveTab,
  onClose,
}: {
  taskId: string;
  data: DetailData;
  loading: boolean;
  activeTab: 'transcript' | 'analysis' | 'recording';
  setActiveTab: (t: 'transcript' | 'analysis' | 'recording') => void;
  onClose: () => void;
}) {
  const { call, analysis, transcript } = data;
  const oc = call ? outcomeConfig[getOutcome(call.outcome)] : outcomeConfig.unknown;

  const detailTabs: { key: typeof activeTab; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { key: 'transcript', label: 'Transcript', icon: MessageSquare, count: transcript?.length },
    { key: 'analysis', label: 'Analysis', icon: BarChart3 },
    { key: 'recording', label: 'Recording', icon: Mic },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-elevated flex flex-col"
      >
        {/* Drawer header */}
        <div className="shrink-0 border-b border-gray-100 px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Call Detail</span>
            </div>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X size={14} />
            </button>
          </div>

          {call ? (
            <div>
              <h2 className="text-[17px] font-semibold text-gray-950 leading-snug">{call.objective || 'Untitled negotiation'}</h2>
              <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
                {call.target_phone ? <span className="text-[11px] text-gray-400">{call.target_phone}</span> : null}
                {call.duration_seconds != null && call.duration_seconds > 0 ? <span className="text-[11px] text-gray-400">{fmtDuration(call.duration_seconds)}</span> : null}
                {call.created_at ? <span className="text-[11px] text-gray-300">{fmtDate(call.created_at)}</span> : null}
              </div>
              {(call.style || call.agent_persona) ? (
                <div className="flex items-center gap-2 mt-2.5">
                  {call.style ? <span className="rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{call.style}</span> : null}
                  {call.agent_persona ? <span className="text-[11px] text-gray-400 truncate">{call.agent_persona}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Detail tabs */}
          <div className="flex gap-1 mt-5 bg-gray-50 rounded-lg p-0.5">
            {detailTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  activeTab === tab.key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {activeTab === tab.key ? (
                  <motion.div layoutId="detail-tab" className="absolute inset-0 bg-white rounded-md shadow-soft" transition={{ type: 'spring', damping: 25, stiffness: 300 }} />
                ) : null}
                <span className="relative z-10 flex items-center gap-1.5">
                  <tab.icon size={12} />
                  {tab.label}
                  {tab.count != null ? <span className="text-[10px] text-gray-300">{tab.count}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={18} className="animate-spin text-gray-300" />
            </div>
          ) : (
            <div className="px-6 py-5">
              {activeTab === 'transcript' ? <TranscriptView transcript={transcript} /> : null}
              {activeTab === 'analysis' ? <AnalysisView analysis={analysis} /> : null}
              {activeTab === 'recording' ? <RecordingView taskId={taskId} /> : null}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Transcript View ────────────────────────────────────────────────────────────

function TranscriptView({ transcript }: { transcript?: TranscriptTurn[] }) {
  if (!transcript || transcript.length === 0) {
    return <EmptyInline icon={MessageSquare} text="No transcript available" />;
  }

  return (
    <div className="space-y-3">
      {transcript.map((turn, i) => {
        const isAgent = turn.speaker === 'agent';
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.5) }}
            className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}
          >
            <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5 ${
              isAgent ? 'bg-gray-900' : 'bg-gray-200'
            }`}>
              {isAgent ? <Bot size={13} className="text-gray-300" /> : <User size={13} className="text-gray-500" />}
            </div>
            <div className={`max-w-[80%] ${isAgent ? '' : 'text-right'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[11px] font-semibold ${isAgent ? 'text-gray-700' : 'text-gray-500'}`}>
                  {isAgent ? 'Agent' : 'Caller'}
                </span>
                {turn.created_at ? (
                  <span className="text-[10px] text-gray-300 font-mono tabular-nums">
                    {typeof turn.created_at === 'number' ? fmtUnixTime(turn.created_at) : ''}
                  </span>
                ) : null}
              </div>
              <div className={`inline-block rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                isAgent
                  ? 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-md'
                  : 'bg-gray-900 text-white rounded-tr-md'
              }`}>
                {turn.content}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Analysis View ──────────────────────────────────────────────────────────────

function AnalysisView({ analysis }: { analysis?: SupabaseAnalysis }) {
  if (!analysis) {
    return <EmptyInline icon={BarChart3} text="No analysis available" />;
  }

  const oc = outcomeConfig[getOutcome(analysis.outcome)];
  const score = analysis.score ?? 0;

  return (
    <div className="space-y-5">
      {/* Score + outcome header */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className={`text-[32px] font-bold tabular-nums leading-none ${scoreColor(score)}`}>{score}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
            <div className={`h-full rounded-full ${scoreBarColor(score)} transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
            {analysis.rapport_quality ? <span className="text-[11px] text-gray-400">Rapport: {analysis.rapport_quality}</span> : null}
          </div>
        </div>
      </div>

      {analysis.summary ? (
        <Section label="Summary">
          <p className="text-[13px] text-gray-700 leading-relaxed">{analysis.summary}</p>
        </Section>
      ) : null}

      {analysis.outcome_reasoning ? (
        <Section label="Outcome Reasoning">
          <p className="text-[13px] text-gray-600 leading-relaxed">{analysis.outcome_reasoning}</p>
        </Section>
      ) : null}

      {analysis.tactics_used && analysis.tactics_used.length > 0 ? (
        <Section label="Tactics Used">
          <div className="space-y-2">
            {analysis.tactics_used.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[13px] font-medium text-gray-700">{t.name}</span>
                {t.effectiveness ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.effectiveness === 'high' ? 'bg-emerald-50 text-emerald-600' :
                    t.effectiveness === 'medium' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>{t.effectiveness}</span>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.key_moments && analysis.key_moments.length > 0 ? (
        <Section label="Key Moments">
          <ul className="space-y-1">
            {analysis.key_moments.map((m, i) => (
              <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                <span className="text-gray-300 shrink-0">&bull;</span>{m}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis.concessions && analysis.concessions.length > 0 ? (
        <Section label="Concessions">
          {analysis.concessions.map((c, i) => (
            <div key={i} className="text-[13px] mb-1">
              <span className="font-medium text-gray-700">{c.party}:</span>{' '}
              <span className="text-gray-600">{c.description}</span>
              {c.significance ? <span className="text-gray-400 text-[12px]"> ({c.significance})</span> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 ? (
        <Section label="Improvement Suggestions">
          <ul className="space-y-1">
            {analysis.improvement_suggestions.map((s, i) => (
              <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                <span className="text-gray-300 shrink-0">&bull;</span>{s}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis.score_reasoning ? (
        <Section label="Score Reasoning">
          <p className="text-[12px] text-gray-500 leading-relaxed">{analysis.score_reasoning}</p>
        </Section>
      ) : null}
    </div>
  );
}

// ─── Recording View ─────────────────────────────────────────────────────────────

function RecordingView({ taskId }: { taskId: string }) {
  const [error, setError] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Play size={14} className="text-gray-500" />
          <span className="text-[13px] font-semibold text-gray-800">Call Recording</span>
          <span className="text-[11px] text-gray-400 ml-auto">Mixed audio</span>
        </div>
        {error ? (
          <p className="text-[13px] text-gray-400">Recording unavailable for this call.</p>
        ) : (
          <audio
            controls
            preload="metadata"
            className="w-full"
            src={getAudioUrl(taskId, 'mixed')}
            onError={() => setError(true)}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AudioTrack taskId={taskId} side="inbound" label="Caller Audio" />
        <AudioTrack taskId={taskId} side="outbound" label="Agent Audio" />
      </div>
    </div>
  );
}

function AudioTrack({ taskId, side, label }: { taskId: string; side: 'inbound' | 'outbound'; label: string }) {
  const [err, setErr] = useState(false);
  if (err) return null;
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <span className="text-[11px] font-medium text-gray-500 mb-2 block">{label}</span>
      <audio
        controls
        preload="metadata"
        className="w-full h-8"
        src={getAudioUrl(taskId, side)}
        onError={() => setErr(true)}
      />
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h4>
      {children}
    </div>
  );
}

function EmptyInline({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={20} className="text-gray-200 mb-2" />
      <p className="text-[13px] text-gray-400">{text}</p>
    </div>
  );
}
