'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Target, Zap, ArrowUpRight, Lightbulb, DollarSign, AlertTriangle } from 'lucide-react';
import type { AnalysisPayload, CallOutcome } from '../lib/types';

const ease = [0.16, 1, 0.3, 1] as const;

const outcomeConfig: Record<CallOutcome, { textColor: string; label: string; icon: string }> = {
  success: { textColor: 'text-emerald-600', label: 'Success', icon: '~' },
  partial: { textColor: 'text-amber-600', label: 'Partial', icon: '~' },
  failed: { textColor: 'text-red-600', label: 'Failed', icon: '~' },
  walkaway: { textColor: 'text-red-500', label: 'Walk-away', icon: '~' },
  unknown: { textColor: 'text-gray-500', label: 'Pending', icon: '~' },
};

function scoreGradient(score: number) {
  if (score >= 70) return 'from-emerald-400 to-emerald-500';
  if (score >= 40) return 'from-amber-400 to-orange-400';
  return 'from-red-400 to-red-500';
}

function ScoreRing({ score }: { score: number }) {
  const radius = 32;
  const size = 76;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const offset = circumference - (normalizedScore / 100) * circumference;
  const isZero = normalizedScore === 0;
  const trackColor = isZero ? '#e5e7eb' : '#f3f4f6';
  const strokeWidth = 4;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isZero ? 'transparent' : 'url(#scoreGrad)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {normalizedScore >= 70 ? (
              <><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" /></>
            ) : normalizedScore >= 40 ? (
              <><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" /></>
            ) : (
              <><stop offset="0%" stopColor="#f87171" /><stop offset="100%" stopColor="#ef4444" /></>
            )}
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.3, ease }}
          className={`text-[20px] font-semibold leading-none tabular-nums ${isZero ? 'text-gray-400' : 'text-gray-900'}`}
        >
          {normalizedScore}
        </motion.span>
        <span className="text-[9px] font-medium text-gray-400 mt-0.5">Score</span>
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
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AnalysisCard({ analysis }: { analysis: AnalysisPayload }) {
  const outcome = outcomeConfig[analysis.outcome] ?? outcomeConfig.unknown;
  const decisionData = (analysis.details as Record<string, unknown>)?.decision_data as
    | { vendor_name?: string; quoted_prices?: string[]; discounts?: string[]; fees?: string[]; terms?: string[]; risks?: string[]; important_numbers?: string[] }
    | undefined;
  const rapportConfig: Record<string, { color: string; label: string }> = {
    excellent: { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Excellent' },
    good: { color: 'bg-blue-50 text-blue-700 border-blue-100', label: 'Good' },
    fair: { color: 'bg-amber-50 text-amber-700 border-amber-100', label: 'Fair' },
    poor: { color: 'bg-red-50 text-red-700 border-red-100', label: 'Poor' },
  };
  const rapport = analysis.rapport_quality ? rapportConfig[analysis.rapport_quality.toLowerCase()] : null;
  const hasDecisionData = decisionData && (
    decisionData.quoted_prices?.length || decisionData.discounts?.length ||
    decisionData.fees?.length || decisionData.terms?.length ||
    decisionData.risks?.length || decisionData.important_numbers?.length
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="rounded-2xl bg-white border border-gray-100 shadow-soft overflow-hidden"
    >
      {/* Hero section — outcome + score + summary */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <ScoreRing score={analysis.score} />

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/50 px-3 py-1 text-[11px] font-medium shadow-soft ${outcome.textColor}`}>
                {outcome.label}
              </span>
              {rapport ? (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${rapport.color}`}>
                  Rapport: {rapport.label}
                </span>
              ) : null}
            </div>

            {analysis.summary ? (
              <p className="text-[13px] text-gray-600 leading-relaxed">{analysis.summary}</p>
            ) : (
              <p className="text-[13px] text-gray-400 italic">No summary available</p>
            )}

            {analysis.outcome_reasoning ? (
              <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed">{analysis.outcome_reasoning}</p>
            ) : null}

            {analysis.score_reasoning ? (
              <p className="text-[11.5px] text-gray-400 mt-1.5 leading-relaxed">{analysis.score_reasoning}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      {/* Details sections */}
      <div className="px-5 py-4 space-y-4">
        {/* Tactics — always visible if present */}
        {analysis.tactics_used?.length > 0 ? (
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
        ) : null}

        {/* Key Moments */}
        {analysis.key_moments?.length > 0 ? (
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
        ) : null}

        {/* Decision Data — prices, fees, terms */}
        {hasDecisionData ? (
          <Section icon={DollarSign} title={decisionData.vendor_name ? `Pricing — ${decisionData.vendor_name}` : 'Pricing & Terms'} delay={0.18}>
            <div className="space-y-2">
              {decisionData.quoted_prices?.length ? (
                <div className="rounded-lg bg-blue-50/60 px-3 py-2">
                  <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Quoted Prices</span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.quoted_prices.map((p, i) => (
                      <p key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{p}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {decisionData.discounts?.length ? (
                <div className="rounded-lg bg-emerald-50/60 px-3 py-2">
                  <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide">Discounts</span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.discounts.map((d, i) => (
                      <p key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{d}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {decisionData.fees?.length ? (
                <div className="rounded-lg bg-amber-50/60 px-3 py-2">
                  <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Fees</span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.fees.map((f, i) => (
                      <p key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{f}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {decisionData.terms?.length ? (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Terms & Constraints</span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.terms.map((t, i) => (
                      <p key={i} className="text-[12.5px] text-gray-600 leading-relaxed">{t}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {decisionData.risks?.length ? (
                <div className="rounded-lg bg-red-50/60 px-3 py-2">
                  <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle size={10} /> Risks
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.risks.map((r, i) => (
                      <p key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{r}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {decisionData.important_numbers?.length ? (
                <div className="rounded-lg bg-purple-50/60 px-3 py-2">
                  <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">Key Numbers</span>
                  <div className="mt-1 space-y-0.5">
                    {decisionData.important_numbers.map((n, i) => (
                      <p key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{n}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* Concessions — collapsible */}
        {analysis.concessions?.length > 0 ? (
          <ExpandableSection icon={ArrowUpRight} title="Concessions" delay={0.2}>
            <div className="space-y-2">
              {analysis.concessions.map((c, i) => (
                <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{c.party}</span>
                    {c.significance ? (
                      <span className="text-[10px] text-gray-400">/ {c.significance}</span>
                    ) : null}
                  </div>
                  <p className="text-[12.5px] text-gray-600 mt-0.5 leading-relaxed">{c.description}</p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        ) : null}

        {/* Suggestions — collapsible */}
        {analysis.improvement_suggestions?.length > 0 ? (
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
        ) : null}
      </div>
    </motion.div>
  );
}
