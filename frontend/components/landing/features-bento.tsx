'use client';

import { Phone, Mic, BarChart3, Shield, Check } from 'lucide-react';
import { Kiru, Reveal } from './shared';

// ── Bento visuals ─────────────────────────────────────────────────────────────

function BentoCallVisual() {
  return (
    <div className="mt-6 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><Phone size={16} className="text-emerald-600" /></div>
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Live</span>
          <span className="text-[11px] text-gray-400">02:34</span>
        </div>
        <div className="flex gap-[2px]">
          {[3,5,8,4,7,9,6,3,5,8,10,7,4,6,8,5,3,7,9,6,4,8,5,3,6,8,4,7].map((h,i) => (
            <div key={i} className="w-[3px] rounded-full bg-emerald-500/50" style={{ height: `${h*2}px` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BentoTacticsVisual() {
  return (
    <div className="mt-6 flex flex-wrap gap-1.5">
      {['Anchoring','Loyalty leverage','Competitor pricing','Escalation','Silence'].map((t) => (
        <span key={t} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600">{t}</span>
      ))}
    </div>
  );
}

function BentoScoreVisual() {
  return (
    <div className="mt-6 flex items-end gap-3">
      <span className="text-[40px] font-bold leading-none tracking-tighter text-gray-900">87</span>
      <div className="mb-1 space-y-0.5">
        <span className="text-[11px] font-medium text-emerald-600">Excellent</span>
        <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden"><div className="h-full w-[87%] rounded-full bg-emerald-500" /></div>
      </div>
    </div>
  );
}

function BentoTranscriptVisual() {
  return (
    <div className="mt-6 space-y-1.5 text-[11px] font-mono">
      {[
        { who: 'Agent', line: "I've been a loyal customer for five years..." },
        { who: 'Rep', line: 'Let me pull up your account.' },
      ].map((l, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-gray-400 shrink-0 w-10">{l.who}</span>
          <span className="text-gray-600">{l.line}</span>
        </div>
      ))}
    </div>
  );
}

function BentoPrivacyVisual() {
  return (
    <div className="mt-6 flex flex-wrap gap-1.5">
      {['Encrypted', 'No training', 'Delete anytime'].map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
          <Check size={8} />
          {t}
        </span>
      ))}
    </div>
  );
}

function BentoAutomationVisual() {
  const steps = [
    { label: 'Dial', time: '0:00' },
    { label: 'Phone tree', time: '0:12' },
    { label: 'On hold', time: '0:45' },
    { label: 'Transfer', time: '38:20' },
    { label: 'Connected', time: '42:15' },
  ];
  return (
    <div className="flex items-center mt-6 lg:mt-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center flex-1 last:flex-initial">
          <div className="text-center shrink-0">
            <div className={`h-3 w-3 rounded-full mx-auto ${i === steps.length - 1 ? 'bg-emerald-500 ring-4 ring-emerald-500/10' : i === 2 ? 'bg-amber-400 ring-4 ring-amber-400/10' : 'bg-gray-300'}`} />
            <p className="text-[11px] font-medium text-gray-600 mt-1.5 whitespace-nowrap">{step.label}</p>
            <p className="text-[10px] text-gray-400 tabular-nums">{step.time}</p>
          </div>
          {i < steps.length - 1 ? <div className="h-px flex-1 bg-gray-200 mx-2 min-w-[16px]" /> : null}
        </div>
      ))}
    </div>
  );
}

// ── Bento Feature Grid ──────────────────────────────────────────────────────────

export default function FeaturesBento() {
  return (
    <section id="features" className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Capabilities</p>
          <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950 max-w-lg">
            One voice agent.{' '}
            <span className="font-serif italic font-normal">Zero effort.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Reveal delay={0.05} className="sm:col-span-2 lg:col-span-2">
            <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M5.72284 3C4.24801 3 2.92738 4.20552 3.09672 5.79624C3.34796 8.15623 4.09035 10.4576 5.28656 12.5194C6.77526 15.0853 8.91559 17.2256 11.4815 18.7143C13.5573 19.9187 15.8298 20.627 18.1723 20.8864C19.7705 21.0633 21.0009 19.743 21.0009 18.25V16.4965C21.0009 15.2766 20.1972 14.2024 19.0269 13.8582L17.3448 13.3635C16.3805 13.0799 15.3386 13.3569 14.6425 14.082C14.2662 14.474 13.7294 14.5345 13.3582 14.2944C11.8978 13.35 10.6509 12.1031 9.70649 10.6427C9.46639 10.2715 9.52689 9.73471 9.91892 9.35836C10.644 8.66231 10.921 7.62038 10.6374 6.65615L10.1427 4.97404C9.79845 3.80369 8.72434 3 7.50442 3H5.72284Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Real Calls</span></div>
              <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Not a chatbot. A real phone call.</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500 max-w-md">
                <Kiru className="text-gray-700" /> dials the number, navigates phone trees, sits on hold, and talks to a human — you just watch the live transcript.
              </p>
              <BentoCallVisual />
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute bottom-3 right-3 w-28 h-auto rounded-md opacity-90"
              >
                <source src="/2.mp4" type="video/mp4" />
              </video>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
              <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M20.25 3C20.6642 3 21 3.33579 21 3.75V9.25C21 9.66421 20.6642 10 20.25 10C19.8358 10 19.5 9.66421 19.5 9.25V5.56055L13.0605 12L19.5 18.4395V14.75C19.5 14.3358 19.8358 14 20.25 14C20.6642 14 21 14.3358 21 14.75V20.25C21 20.6642 20.6642 21 20.25 21H14.75C14.3358 21 14 20.6642 14 20.25C14 19.8358 14.3358 19.5 14.75 19.5H18.4395L11.6895 12.75H3.75C3.33579 12.75 3 12.4142 3 12C3 11.5858 3.33579 11.25 3.75 11.25H11.6895L18.4395 4.5H14.75C14.3358 4.5 14 4.16421 14 3.75C14 3.33579 14.3358 3 14.75 3H20.25Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Strategy</span></div>
              <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Switches tactics on the fly</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Anchoring, competitor leverage, escalation — it reads the conversation and adapts in real-time.</p>
              <BentoTacticsVisual />
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1"><BarChart3 size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Analysis</span></div>
              <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Post-call scorecard</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">After every call you get a performance score, tactic breakdown, and what you saved.</p>
              <BentoScoreVisual />
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute bottom-3 right-3 w-28 h-auto rounded-md opacity-90"
              >
                <source src="/3.mp4" type="video/mp4" />
              </video>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1"><Shield size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Privacy</span></div>
              <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Your data stays yours</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Calls are processed securely. No training on your conversations. Delete anytime.</p>
              <BentoPrivacyVisual />
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute bottom-3 right-3 w-28 h-auto rounded-md opacity-90"
              >
                <source src="/private.mp4" type="video/mp4" />
              </video>
            </div>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1"><Mic size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Transcript</span></div>
              <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Full transcript + recording</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Replay the audio or read the transcript. Know exactly what was said and agreed to.</p>
              <BentoTranscriptVisual />
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute bottom-3 right-3 w-28 h-auto rounded-md opacity-90"
              >
                <source src="/transcript.mp4" type="video/mp4" />
              </video>
            </div>
          </Reveal>
          <Reveal delay={0.3} className="sm:col-span-2 lg:col-span-3">
            <div className="group rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50/80 via-white to-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card">
              <div className="lg:flex lg:items-center lg:justify-between lg:gap-12">
                <div className="lg:max-w-md">
                  <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M3.38184 13.2568C3.79229 13.3115 4.08083 13.6882 4.02637 14.0986C4.00894 14.2295 4 14.3637 4 14.5C4 15.9621 5.04614 17.1793 6.43066 17.4453V16.4512C6.43066 15.9421 7.04627 15.6869 7.40625 16.0469L9.45508 18.0957C9.67824 18.3189 9.67824 18.6811 9.45508 18.9043L7.40625 20.9531C7.04625 21.3129 6.43066 21.0579 6.43066 20.5488V18.9619C4.21432 18.6819 2.5 16.7923 2.5 14.5C2.5 14.2974 2.51391 14.0976 2.54004 13.9014C2.59473 13.4909 2.97134 13.2023 3.38184 13.2568Z" fill="currentColor"/><path d="M17.25 3C17.6642 3 18 3.33579 18 3.75V15.75C18 16.1642 17.6642 16.5 17.25 16.5C16.8358 16.5 16.5 16.1642 16.5 15.75V3.75C16.5 3.33579 16.8358 3 17.25 3Z" fill="currentColor"/><path d="M6.59375 8.47559C6.95373 8.11561 7.56934 8.37079 7.56934 8.87988V10.0371C9.78574 10.317 11.5 12.2076 11.5 14.5C11.5 14.7026 11.4861 14.9024 11.46 15.0986C11.4053 15.5091 11.0287 15.7977 10.6182 15.7432C10.2077 15.6885 9.91917 15.3118 9.97363 14.9014C9.99106 14.7705 10 14.6363 10 14.5C10 13.0378 8.95395 11.8197 7.56934 11.5537V12.9775C7.56934 13.4866 6.95375 13.7416 6.59375 13.3818L4.54492 11.333C4.32177 11.1099 4.32177 10.7476 4.54492 10.5244L6.59375 8.47559Z" fill="currentColor"/><path d="M13.75 6C14.1642 6 14.5 6.33579 14.5 6.75V10.75C14.5 11.1642 14.1642 11.5 13.75 11.5C13.3358 11.5 13 11.1642 13 10.75V6.75C13 6.33579 13.3358 6 13.75 6Z" fill="currentColor"/><path d="M20.75 8C21.1642 8 21.5 8.33579 21.5 8.75V10.75C21.5 11.1642 21.1642 11.5 20.75 11.5C20.3358 11.5 20 11.1642 20 10.75V8.75C20 8.33579 20.3358 8 20.75 8Z" fill="currentColor"/><path d="M10.25 4C10.6642 4 11 4.33579 11 4.75V7.25C11 7.66421 10.6642 8 10.25 8C9.83579 8 9.5 7.66421 9.5 7.25V4.75C9.5 4.33579 9.83579 4 10.25 4Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Automation</span></div>
                  <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Phone trees, hold music, transfers — handled</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Press 1 for English. 45 minutes of hold music. Transferred twice. <Kiru className="text-gray-700" /> absorbs all of it so you never have to.</p>
                </div>
                <div className="lg:flex-1 lg:max-w-lg">
                  <BentoAutomationVisual />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
