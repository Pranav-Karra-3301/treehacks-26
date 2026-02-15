'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ArrowLeft } from 'lucide-react';
import { listTasks, getTaskAnalysis } from '../lib/api';
import type { TaskSummary, AnalysisPayload, CallOutcome } from '../lib/types';
import AnalysisCard from './analysis-card';
import AudioPlayer from './audio-player';

const outcomeBadgeColors: Record<CallOutcome, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  walkaway: 'bg-red-50 text-red-600',
  unknown: 'bg-gray-100 text-gray-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTasks();
      setTasks(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTasks();
      setSelectedTask(null);
      setAnalysis(null);
    }
  }, [open, fetchTasks]);

  async function selectTask(id: string) {
    setSelectedTask(id);
    setAnalysis(null);
    setAnalysisLoading(true);
    try {
      const data = await getTaskAnalysis(id);
      setAnalysis(data);
    } catch {
      // no analysis available
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-elevated overflow-y-auto"
          >
            {/* Panel Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white/90 backdrop-blur-xl border-b border-gray-200/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                {selectedTask ? (
                  <button
                    onClick={() => { setSelectedTask(null); setAnalysis(null); }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <ArrowLeft size={14} />
                  </button>
                ) : null}
                <h2 className="text-[15px] font-semibold text-gray-900">
                  {selectedTask ? 'Negotiation Detail' : 'History'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5">
              {!selectedTask ? (
                /* List view */
                loading ? (
                  <p className="text-[13px] text-gray-400 text-center py-8">Loading...</p>
                ) : tasks.length === 0 ? (
                  <p className="text-[13px] text-gray-400 text-center py-8">No past negotiations</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((t) => {
                      const badge = outcomeBadgeColors[t.outcome] ?? outcomeBadgeColors.unknown;
                      return (
                        <button
                          key={t.id}
                          onClick={() => selectTask(t.id)}
                          className="w-full text-left rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-soft hover:shadow-card transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-gray-900 truncate">{t.objective}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                                  {t.outcome}
                                </span>
                                {t.duration_seconds > 0 ? (
                                  <span className="text-[11px] text-gray-400">{formatDuration(t.duration_seconds)}</span>
                                ) : null}
                                <span className="text-[11px] text-gray-400">{formatDate(t.created_at)}</span>
                              </div>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 shrink-0 mt-1" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Detail view */
                <div className="space-y-4">
                  {analysisLoading ? (
                    <p className="text-[13px] text-gray-400 text-center py-8">Loading analysis...</p>
                  ) : analysis ? (
                    <>
                      <AnalysisCard analysis={analysis} />
                      <AudioPlayer taskId={selectedTask} />
                    </>
                  ) : (
                    <p className="text-[13px] text-gray-400 text-center py-8">No analysis available</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
