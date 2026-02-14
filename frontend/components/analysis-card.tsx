'use client';

import { motion } from 'framer-motion';
import type { AnalysisPayload, CallOutcome } from '../lib/types';

const outcomeBadge: Record<CallOutcome, { bg: string; text: string; label: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Success' },
  partial: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Partial' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Failed' },
  walkaway: { bg: 'bg-red-50', text: 'text-red-600', label: 'Walk-away' },
  unknown: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Unknown' },
};

function scoreColor(score: number) {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function AnalysisCard({ analysis }: { analysis: AnalysisPayload }) {
  const badge = outcomeBadge[analysis.outcome] ?? outcomeBadge.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-white border border-gray-100 shadow-soft overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-[15px] font-semibold text-gray-900">Negotiation Results</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Score bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">Score</span>
            <span className="text-[13px] font-semibold text-gray-900">{analysis.score}/100</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor(analysis.score)}`}
              style={{ width: `${Math.min(analysis.score, 100)}%` }}
            />
          </div>
          {analysis.score_reasoning && (
            <p className="text-[12px] text-gray-400 leading-relaxed">{analysis.score_reasoning}</p>
          )}
        </div>

        {/* Summary */}
        {analysis.summary && (
          <div>
            <h4 className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-1">Summary</h4>
            <p className="text-[13px] text-gray-700 leading-relaxed">{analysis.summary}</p>
          </div>
        )}

        {/* Tactics Used */}
        {analysis.tactics_used?.length > 0 && (
          <div>
            <h4 className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-2">Tactics Used</h4>
            <div className="space-y-2">
              {analysis.tactics_used.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[13px] text-gray-700 font-medium">{t.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    t.effectiveness === 'high' ? 'bg-emerald-50 text-emerald-600' :
                    t.effectiveness === 'medium' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {t.effectiveness}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Moments */}
        {analysis.key_moments?.length > 0 && (
          <div>
            <h4 className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Key Moments</h4>
            <ul className="space-y-1">
              {analysis.key_moments.map((m, i) => (
                <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                  <span className="text-gray-300 shrink-0">&bull;</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Concessions */}
        {analysis.concessions?.length > 0 && (
          <div>
            <h4 className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Concessions</h4>
            <div className="space-y-2">
              {analysis.concessions.map((c, i) => (
                <div key={i} className="text-[13px]">
                  <span className="font-medium text-gray-700">{c.party}:</span>{' '}
                  <span className="text-gray-600">{c.description}</span>
                  {c.significance && (
                    <span className="text-gray-400 text-[12px]"> ({c.significance})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Suggestions */}
        {analysis.improvement_suggestions?.length > 0 && (
          <div>
            <h4 className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Suggestions</h4>
            <ul className="space-y-1">
              {analysis.improvement_suggestions.map((s, i) => (
                <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex gap-2">
                  <span className="text-gray-300 shrink-0">&bull;</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
