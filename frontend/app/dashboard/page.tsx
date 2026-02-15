'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Activity,
  Phone,
  Clock,
  TrendingUp,
  BarChart3,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Mic,
  User,
  Bot,
  X,
  FileText,
  Play,
} from 'lucide-react';
import {
  listTasks,
  getTask,
  getTaskAnalysis,
  getTaskTranscript,
  getAudioUrl,
  getRecordingMetadata,
  fetchTelemetryRecent,
  fetchTelemetrySummary,
} from '../../lib/api';
import type {
  TaskSummary,
  TaskDetail,
  TranscriptEntry,
  AnalysisPayload,
  CallOutcome,
  TelemetryRecentResponse,
  TelemetrySummaryResponse,
} from '../../lib/types';

// ─── Design tokens ──────────────────────────────────────────────────────────────

const outcomeConfig: Record<CallOutcome, { bg: string; text: string; dot: string; label: string }> = {
  success:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Success' },
  partial:  { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Partial' },
  failed:   { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Failed' },
  walkaway: { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     label: 'Walk-away' },
  unknown:  { bg: 'bg-gray-100',   text: 'text-gray-500',    dot: 'bg-gray-400',    label: 'Unknown' },
};

const statusDot: Record<string, string> = {
  pending: 'bg-gray-300', dialing: 'bg-amber-400 animate-pulse', active: 'bg-emerald-500 animate-pulse', ended: 'bg-gray-400', failed: 'bg-red-500',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(s: number) {
  if (s <= 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts: string | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
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

// ─── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'calls' | 'events' | 'health';
type CallDetailData = {
  detail?: TaskDetail;
  analysis?: AnalysisPayload;
  transcript?: TranscriptEntry[];
  recording?: { bytes_by_side?: Record<string, number>; duration_seconds?: number };
};

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [telemetryRecent, setTelemetryRecent] = useState<TelemetryRecentResponse | null>(null);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('calls');

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CallDetailData>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'transcript' | 'analysis' | 'recording'>('transcript');

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch all ──────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const [t, r, s] = await Promise.allSettled([listTasks(), fetchTelemetryRecent(50), fetchTelemetrySummary()]);
      if (t.status === 'fulfilled') setTasks(t.value);
      if (r.status === 'fulfilled') setTelemetryRecent(r.value);
      if (s.status === 'fulfilled') setTelemetrySummary(s.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    refreshRef.current = setInterval(fetchAll, 30_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchAll]);

  // ── Open detail drawer ─────────────────────────────────────────────────────

  async function openDetail(taskId: string) {
    setSelectedId(taskId);
    setDetailLoading(true);
    setDetailTab('transcript');
    setDetailData({});

    const results = await Promise.allSettled([
      getTask(taskId),
      getTaskAnalysis(taskId),
      getTaskTranscript(taskId),
      getRecordingMetadata(taskId),
    ]);

    setDetailData({
      detail: results[0].status === 'fulfilled' ? results[0].value : undefined,
      analysis: results[1].status === 'fulfilled' ? results[1].value : undefined,
      transcript: results[2].status === 'fulfilled' ? results[2].value.turns : undefined,
      recording: results[3].status === 'fulfilled' ? (results[3].value as CallDetailData['recording']) : undefined,
    });
    setDetailLoading(false);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetailData({});
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total = tasks.length;
  const ended = tasks.filter((t) => t.status === 'ended');
  const successes = ended.filter((t) => t.outcome === 'success').length;
  const rate = ended.length > 0 ? Math.round((successes / ended.length) * 100) : 0;
  const durations = ended.map((t) => t.duration_seconds).filter((d) => d > 0);
  const avgDur = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const active = tasks.filter((t) => t.status === 'active' || t.status === 'dialing').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'calls', label: 'Negotiations' },
    { key: 'events', label: 'Event Log' },
    { key: 'health', label: 'System' },
  ];

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-3">
        <header className="w-full max-w-5xl flex items-center justify-between rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-soft px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-[28px] tracking-tight text-gray-950 font-serif italic">kiru</span>
            <span className="text-[12px] text-gray-400 font-medium ml-0.5 mt-px">Dashboard</span>
          </div>
          <Link href="/chat" className="group inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-gray-800 transition">
            Launch App <ArrowUpRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </header>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Calls', value: loading ? '...' : String(total), sub: active > 0 ? `${active} active` : undefined, icon: Phone, delay: 0 },
            { label: 'Success Rate', value: loading ? '...' : ended.length > 0 ? `${rate}%` : '—', sub: ended.length > 0 ? `${successes}/${ended.length} calls` : undefined, icon: TrendingUp, delay: 0.04 },
            { label: 'Avg Duration', value: loading ? '...' : avgDur > 0 ? fmtDuration(avgDur) : '—', icon: Clock, delay: 0.08 },
            { label: 'Events', value: loading ? '...' : telemetrySummary ? telemetrySummary.event_count.toLocaleString() : '—', sub: telemetrySummary?.durations_ms.avg_ms != null ? `avg ${fmtMs(telemetrySummary.durations_ms.avg_ms)}` : undefined, icon: Activity, delay: 0.12 },
          ].map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: s.delay, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl border border-gray-100 shadow-soft px-5 py-4"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <s.icon size={13} className="text-gray-400" />
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-[22px] font-bold tracking-tight text-gray-900 tabular-nums leading-none">{s.value}</p>
              {s.sub && <p className="text-[11px] text-gray-400 mt-1">{s.sub}</p>}
            </motion.div>
          ))}
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 shadow-soft mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                activeTab === tab.key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div layoutId="dash-tab" className="absolute inset-0 bg-gray-100/80 rounded-lg" transition={{ type: 'spring', damping: 25, stiffness: 300 }} />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : (
          <>
            {/* ── Negotiations ─────────────────────────────────────────── */}
            {activeTab === 'calls' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {tasks.length === 0 ? (
                  <EmptyState icon={Phone} text="No negotiations yet" sub="Start a negotiation from the app to see results here." />
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((task, i) => (
                      <CallRow key={task.id} task={task} index={i} onSelect={openDetail} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Event Log ────────────────────────────────────────────── */}
            {activeTab === 'events' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {!telemetryRecent || telemetryRecent.events.length === 0 ? (
                  <EmptyState icon={Activity} text="No events recorded" />
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                    <div className="grid grid-cols-[100px_1fr_1fr_72px_80px] gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
                      {['Time', 'Component', 'Action', 'Status', 'Latency'].map((h) => (
                        <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                      ))}
                    </div>
                    <div className="max-h-[540px] overflow-y-auto divide-y divide-gray-50/80">
                      {[...telemetryRecent.events].reverse().map((evt, i) => (
                        <div key={i} className="grid grid-cols-[100px_1fr_1fr_72px_80px] gap-2 px-5 py-2 hover:bg-gray-50/50 transition-colors">
                          <span className="text-[11px] font-mono text-gray-400 tabular-nums">{fmtTime(evt.timestamp ?? evt.started_at)}</span>
                          <span className="text-[12px] font-medium text-gray-700 truncate">{evt.component}</span>
                          <span className="text-[12px] text-gray-500 truncate">{evt.action}</span>
                          <span className="flex items-center gap-1">
                            {evt.status === 'ok' ? <CheckCircle2 size={11} className="text-emerald-500" /> : evt.status === 'error' ? <XCircle size={11} className="text-red-500" /> : <AlertTriangle size={11} className="text-amber-500" />}
                            <span className={`text-[10px] font-medium ${evt.status === 'ok' ? 'text-emerald-600' : evt.status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>{evt.status}</span>
                          </span>
                          <span className="text-[11px] font-mono text-gray-400 tabular-nums text-right">{fmtMs(evt.duration_ms)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── System Health ─────────────────────────────────────────── */}
            {activeTab === 'health' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-4">
                {!telemetrySummary || telemetrySummary.event_count === 0 ? (
                  <EmptyState icon={Cpu} text="No telemetry data" />
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Total Events', value: telemetrySummary.event_count.toLocaleString() },
                        { label: 'Avg Latency', value: fmtMs(telemetrySummary.durations_ms.avg_ms) },
                        { label: 'p95 Latency', value: fmtMs(telemetrySummary.durations_ms.p95_ms) },
                      ].map((s) => (
                        <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-soft px-5 py-4">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</span>
                          <p className="text-[20px] font-bold text-gray-900 tabular-nums mt-1">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100">
                        <h3 className="text-[14px] font-semibold text-gray-900">Components</h3>
                      </div>
                      <div className="divide-y divide-gray-50/80">
                        {Object.entries(telemetrySummary.components).sort(([, a], [, b]) => b.count - a.count).map(([name, stats]) => {
                          const max = Math.max(...Object.values(telemetrySummary.components).map((c) => c.count));
                          return (
                            <div key={name} className="px-5 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[13px] font-medium text-gray-800">{name}</span>
                                <div className="flex items-center gap-3 text-[10px] text-gray-400 tabular-nums">
                                  <span>{stats.count} events</span>
                                  {stats.error > 0 && <span className="text-red-500">{stats.error} err</span>}
                                  {stats.avg_ms != null && <span>{fmtMs(stats.avg_ms)} avg</span>}
                                </div>
                              </div>
                              <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full bg-gray-900 transition-all" style={{ width: `${(stats.count / max) * 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {telemetrySummary.slowest_events.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-gray-100">
                          <h3 className="text-[14px] font-semibold text-gray-900">Slowest Operations</h3>
                        </div>
                        <div className="divide-y divide-gray-50/80">
                          {telemetrySummary.slowest_events.slice(0, 8).map((evt, i) => (
                            <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                              <span className="text-[10px] font-mono text-gray-300 w-4 shrink-0">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-gray-700 truncate">{evt.component}/{evt.action}</p>
                              </div>
                              <span className={`text-[12px] font-mono font-semibold tabular-nums ${(evt.duration_ms ?? 0) > 3000 ? 'text-red-500' : 'text-gray-600'}`}>{fmtMs(evt.duration_ms)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* ── Detail Drawer ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedId && (
          <DetailDrawer
            taskId={selectedId}
            data={detailData}
            loading={detailLoading}
            activeTab={detailTab}
            setActiveTab={setDetailTab}
            onClose={closeDetail}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Call Row ───────────────────────────────────────────────────────────────────

function CallRow({ task, index, onSelect }: { task: TaskSummary; index: number; onSelect: (id: string) => void }) {
  const oc = outcomeConfig[task.outcome] ?? outcomeConfig.unknown;
  const dot = statusDot[task.status] ?? 'bg-gray-300';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onSelect(task.id)}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-soft px-5 py-4 hover:shadow-card hover:border-gray-200/80 transition-all group"
    >
      <div className="flex items-center gap-4">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-gray-900 truncate group-hover:text-gray-950 transition-colors">
            {task.objective || 'Untitled negotiation'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
            {task.duration_seconds > 0 && <span className="text-[11px] text-gray-400">{fmtDuration(task.duration_seconds)}</span>}
            <span className="text-[11px] text-gray-300">{fmtDate(task.created_at)}</span>
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
  data: CallDetailData;
  loading: boolean;
  activeTab: 'transcript' | 'analysis' | 'recording';
  setActiveTab: (t: 'transcript' | 'analysis' | 'recording') => void;
  onClose: () => void;
}) {
  const { detail, analysis, transcript, recording } = data;
  const oc = detail ? (outcomeConfig[detail.outcome] ?? outcomeConfig.unknown) : outcomeConfig.unknown;

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
        <div className="shrink-0 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-gray-400" />
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Call Detail</span>
            </div>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X size={14} />
            </button>
          </div>

          {detail && (
            <div>
              <h2 className="text-[16px] font-semibold text-gray-900 leading-snug">{detail.objective || 'Untitled negotiation'}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
                <span className="text-[11px] text-gray-400">{detail.target_phone}</span>
                {detail.duration_seconds > 0 && <span className="text-[11px] text-gray-400">{fmtDuration(detail.duration_seconds)}</span>}
                <span className="text-[11px] text-gray-300">{fmtDate(detail.created_at)}</span>
              </div>
              {(detail.style || detail.agent_persona) && (
                <div className="flex items-center gap-2 mt-2">
                  {detail.style && <span className="rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{detail.style}</span>}
                  {detail.agent_persona && <span className="text-[11px] text-gray-400 truncate">{detail.agent_persona}</span>}
                </div>
              )}
            </div>
          )}

          {/* Detail tabs */}
          <div className="flex gap-1 mt-4 bg-gray-50 rounded-lg p-0.5">
            {detailTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  activeTab === tab.key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {activeTab === tab.key && (
                  <motion.div layoutId="detail-tab" className="absolute inset-0 bg-white rounded-md shadow-soft" transition={{ type: 'spring', damping: 25, stiffness: 300 }} />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <tab.icon size={12} />
                  {tab.label}
                  {tab.count != null && <span className="text-[10px] text-gray-300">{tab.count}</span>}
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
              {activeTab === 'transcript' && <TranscriptView transcript={transcript} />}
              {activeTab === 'analysis' && <AnalysisView analysis={analysis} />}
              {activeTab === 'recording' && <RecordingView taskId={taskId} recording={recording} />}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Transcript View ────────────────────────────────────────────────────────────

function TranscriptView({ transcript }: { transcript?: TranscriptEntry[] }) {
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
                {turn.created_at && (
                  <span className="text-[10px] text-gray-300 font-mono tabular-nums">
                    {typeof turn.created_at === 'number' ? fmtUnixTime(turn.created_at as number) : ''}
                  </span>
                )}
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

function AnalysisView({ analysis }: { analysis?: AnalysisPayload }) {
  if (!analysis) {
    return <EmptyInline icon={BarChart3} text="No analysis available" />;
  }

  const oc = outcomeConfig[analysis.outcome] ?? outcomeConfig.unknown;

  return (
    <div className="space-y-5">
      {/* Score + outcome header */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className={`text-[32px] font-bold tabular-nums leading-none ${scoreColor(analysis.score)}`}>{analysis.score}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
            <div className={`h-full rounded-full ${scoreBarColor(analysis.score)} transition-all`} style={{ width: `${Math.min(analysis.score, 100)}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${oc.bg} ${oc.text}`}>{oc.label}</span>
            {analysis.rapport_quality && <span className="text-[11px] text-gray-400">Rapport: {analysis.rapport_quality}</span>}
          </div>
        </div>
      </div>

      {/* Summary */}
      {analysis.summary && (
        <Section label="Summary">
          <p className="text-[13px] text-gray-700 leading-relaxed">{analysis.summary}</p>
        </Section>
      )}

      {analysis.outcome_reasoning && (
        <Section label="Outcome Reasoning">
          <p className="text-[13px] text-gray-600 leading-relaxed">{analysis.outcome_reasoning}</p>
        </Section>
      )}

      {/* Tactics */}
      {analysis.tactics_used && analysis.tactics_used.length > 0 && (
        <Section label="Tactics Used">
          <div className="space-y-2">
            {analysis.tactics_used.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[13px] font-medium text-gray-700">{t.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  t.effectiveness === 'high' ? 'bg-emerald-50 text-emerald-600' :
                  t.effectiveness === 'medium' ? 'bg-amber-50 text-amber-600' :
                  'bg-gray-100 text-gray-500'
                }`}>{t.effectiveness}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Key moments */}
      {analysis.key_moments && analysis.key_moments.length > 0 && (
        <Section label="Key Moments">
          <ul className="space-y-1">
            {analysis.key_moments.map((m, i) => (
              <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                <span className="text-gray-300 shrink-0">&bull;</span>{m}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Concessions */}
      {analysis.concessions && analysis.concessions.length > 0 && (
        <Section label="Concessions">
          {analysis.concessions.map((c, i) => (
            <div key={i} className="text-[13px] mb-1">
              <span className="font-medium text-gray-700">{c.party}:</span>{' '}
              <span className="text-gray-600">{c.description}</span>
              {c.significance && <span className="text-gray-400 text-[12px]"> ({c.significance})</span>}
            </div>
          ))}
        </Section>
      )}

      {/* Suggestions */}
      {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 && (
        <Section label="Improvement Suggestions">
          <ul className="space-y-1">
            {analysis.improvement_suggestions.map((s, i) => (
              <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                <span className="text-gray-300 shrink-0">&bull;</span>{s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {analysis.score_reasoning && (
        <Section label="Score Reasoning">
          <p className="text-[12px] text-gray-500 leading-relaxed">{analysis.score_reasoning}</p>
        </Section>
      )}
    </div>
  );
}

// ─── Recording View ─────────────────────────────────────────────────────────────

function RecordingView({ taskId, recording }: { taskId: string; recording?: CallDetailData['recording'] }) {
  const [error, setError] = useState(false);

  return (
    <div className="space-y-4">
      {/* Audio player */}
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

      {/* Individual tracks */}
      <div className="grid grid-cols-2 gap-3">
        <AudioTrack taskId={taskId} side="inbound" label="Caller Audio" />
        <AudioTrack taskId={taskId} side="outbound" label="Agent Audio" />
      </div>

      {/* Recording stats */}
      {recording && recording.bytes_by_side && (
        <Section label="Recording Metadata">
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(recording.bytes_by_side).map(([side, bytes]) => (
              <div key={side} className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{side}</span>
                <p className="text-[13px] font-semibold text-gray-700 tabular-nums">{(bytes / 1024).toFixed(0)} KB</p>
              </div>
            ))}
          </div>
          {recording.duration_seconds != null && recording.duration_seconds > 0 && (
            <p className="text-[12px] text-gray-400 mt-2">Duration: {fmtDuration(recording.duration_seconds)}</p>
          )}
        </Section>
      )}
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

function EmptyState({ icon: Icon, text, sub }: { icon: typeof Phone; text: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft px-6 py-16 text-center">
      <Icon size={24} className="text-gray-200 mx-auto mb-3" />
      <p className="text-[14px] font-medium text-gray-400">{text}</p>
      {sub && <p className="text-[12px] text-gray-300 mt-1">{sub}</p>}
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
