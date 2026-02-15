'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Target, Zap, MessageCircle, ArrowUpRight, Lightbulb } from 'lucide-react';
import type { AnalysisPayload, CallOutcome } from '../lib/types';

const ease = [0.16, 1, 0.3, 1] as const;

const outcomeConfig: Record<CallOutcome, { gradient: string; ring: string; label: string; icon: string }> = {
  success: { gradient: 'from-emerald-500 to-emerald-600', ring: 'ring-emerald-500/20', label: 'Success', icon: '~' },
  partial: { gradient: 'from-amber-500 to-orange-500', ring: 'ring-amber-500/20', label: 'Partial', icon: '~' },
  failed: { gradient: 'from-red-500 to-red-600', ring: 'ring-red-500/20', label: 'Failed', icon: '~' },
  walkaway: { gradient: 'from-red-400 to-red-500', ring: 'ring-red-400/20', label: 'Walk-away', icon: '~' },
  unknown: { gradient: 'from-gray-400 to-gray-500', ring: 'ring-gray-400/20', label: 'Pending', icon: '~' },
};

function scoreGradient(score: number) {
  if (score >= 70) return 'from-emerald-400 to-emerald-500';
  if (score >= 40) return 'from-amber-400 to-orange-400';
  return 'from-red-400 to-red-500';
}

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="5" />
        <motion.circle
          cx="44" cy="44" r={radius} fill="none"
          stroke="url(#scoreGrad)" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {score >= 70 ? (
              <><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" /></>
            ) : score >= 40 ? (
              <><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></>
            ) : (
              <><stop offset="0%" stopColor="#f87171" /><stop offset="100%" stopColor="#ef4444" /></>
            )}
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.4, ease }}
          className="text-[22px] font-bold text-gray-900 leading-none tabular-nums"
        >
          {score}
        </motion.span>
        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mt-0.5">score</span>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, delay = 0 }: {
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </motion.div>
  );
}

function ExpandableSection({ icon: Icon, title, children, delay = 0 }: {
  icon: typeof Target;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full group"
      >
        <Icon size={12} className="text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
        <ChevronDown
          size={12}
          className={`text-gray-300 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AnalysisCard({ analysis }: { analysis: AnalysisPayload }) {
  const outcome = outcomeConfig[analysis.outcome] ?? outcomeConfig.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="rounded-2xl bg-white border border-gray-100 shadow-soft overflow-hidden"
    >
      {/* Hero section — score ring + outcome + summary */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <ScoreRing score={analysis.score} />

          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${outcome.gradient} px-2.5 py-0.5 text-[10.5px] font-semibold text-white shadow-sm`}>
                {outcome.label}
              </span>
            </div>

            {analysis.summary ? (
              <p className="text-[13px] text-gray-600 leading-relaxed">{analysis.summary}</p>
            ) : (
              <p className="text-[13px] text-gray-400 italic">No summary available</p>
            )}

            {analysis.score_reasoning && (
              <p className="text-[11.5px] text-gray-400 mt-1.5 leading-relaxed">{analysis.score_reasoning}</p>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* Details sections */}
      <div className="px-5 py-4 space-y-4">
        {/* Tactics — always visible if present */}
        {analysis.tactics_used?.length > 0 && (
          <Section icon={Zap} title="Tactics" delay={0.1}>
            <div className="flex flex-wrap gap-1.5">
              {analysis.tactics_used.map((t, i) => {
                const eff = t.effectiveness?.toLowerCase();
                const color = eff === 'high'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : eff === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                    : 'bg-gray-50 text-gray-600 border-gray-100';
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-medium ${color}`}
                    title={t.description}
                  >
                    {t.name}
                  </span>
                );
              })}
            </div>
          </Section>
        )}

        {/* Key Moments */}
        {analysis.key_moments?.length > 0 && (
          <Section icon={Target} title="Key Moments" delay={0.15}>
            <div className="space-y-1.5">
              {analysis.key_moments.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-[12.5px] text-gray-600 leading-relaxed">{m}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Concessions — collapsible */}
        {analysis.concessions?.length > 0 && (
          <ExpandableSection icon={ArrowUpRight} title="Concessions" delay={0.2}>
            <div className="space-y-2">
              {analysis.concessions.map((c, i) => (
                <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{c.party}</span>
                    {c.significance && (
                      <span className="text-[10px] text-gray-400">/ {c.significance}</span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-gray-600 mt-0.5 leading-relaxed">{c.description}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Suggestions — collapsible */}
        {analysis.improvement_suggestions?.length > 0 && (
          <ExpandableSection icon={Lightbulb} title="Next Time" delay={0.25}>
            <div className="space-y-1.5">
              {analysis.improvement_suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-[12.5px] text-gray-600 leading-relaxed">{s}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}
      </div>
    </motion.div>
  );
}
