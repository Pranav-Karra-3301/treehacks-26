'use client';

import Link from 'next/link';
import { useRef, ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import MermaidDiagram from '@/components/mermaid-diagram';

// ─── Branded wordmark ──────────────────────────────────────────────────────────

function Kiru({ className = '' }: { className?: string }) {
  return (
    <span
      className={`italic ${className}`}
      style={{ fontFamily: '"Martina Plantijn", Georgia, serif' }}
    >
      kiru
    </span>
  );
}

// ─── Scroll reveal ─────────────────────────────────────────────────────────────

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

// ─── Yellow highlight for notable content ──────────────────────────────────────

function HL({ children }: { children: ReactNode }) {
  return <span className="bg-amber-100/80 text-gray-900 px-1 rounded-sm font-medium">{children}</span>;
}

// ─── Diagram definitions ───────────────────────────────────────────────────────

const endToEndChart = `
graph LR
  User([User]) --> Frontend[Next.js Frontend]
  Frontend -->|REST API| Backend[FastAPI Backend]
  Backend -->|Place Call| Twilio[Twilio]
  Twilio -->|Phone Call| Phone([Recipient])
  Twilio -->|Media WS| Backend
  Backend -->|STT| Deepgram[Deepgram]
  Backend -->|Prompt| LLM[LLM Provider]
  Backend -->|WS Events| Frontend
`;

const llmProviderChart = `
graph LR
  Config[LLM_PROVIDER] --> OpenAI[OpenAI gpt-4o-mini]
  Config --> Anthropic[Anthropic Claude Sonnet]
  Config --> Local[Ollama qwen3:30b-a3b]
  OpenAI --> Stream[Streaming Response]
  Anthropic --> Stream
  Local --> Stream
`;

const callLifecycleChart = `
graph LR
  Pending([pending]) -->|Start Call| Dialing([dialing])
  Dialing -->|Connected| Active([active])
  Active -->|Hang Up| Ended([ended])
  Ended -->|Auto| Analyzing([analyzing])
  Analyzing -->|Done| Complete([complete])
`;

const audioPipelineChart = `
sequenceDiagram
  participant Phone as Recipient
  participant Twilio as Twilio
  participant Orch as Orchestrator
  participant DG as Deepgram STT
  participant LLM as LLM Provider

  Phone->>Twilio: Voice Audio
  Twilio->>Orch: mulaw Audio (Media WS)
  Orch->>DG: Audio Stream
  DG-->>Orch: Transcript
  Orch->>LLM: Utterance + Context
  LLM-->>Orch: Streamed Response
  Orch->>Twilio: TTS Audio
  Twilio->>Phone: Voice Audio
`;

const negotiationEngineChart = `
graph LR
  Input[Utterance] --> TC{Turn Count}
  TC -->|1-3| Open[Opening]
  TC -->|4-8| Disc[Discovery]
  TC -->|9-14| Prop[Proposal]
  TC -->|15+| Close[Closing]
  Open --> Prompt[System Prompt]
  Disc --> Prompt
  Prop --> Prompt
  Close --> Prompt
  Prompt --> LLM[LLM Stream]
  LLM --> Out[Transcript + WS + TTS]
`;

const frontendRealtimeChart = `
sequenceDiagram
  participant Browser as Browser
  participant Next as Next.js
  participant WS as WebSocket
  participant Orch as Orchestrator

  Browser->>Next: Open /call/:id
  Next->>WS: Connect
  Orch-->>WS: call_status: active
  Orch-->>WS: transcript_update
  Orch-->>WS: agent_thinking
  Browser->>Orch: End Call
  Orch-->>WS: call_status: ended
  Orch-->>WS: analysis_ready
`;

// ─── Section data ──────────────────────────────────────────────────────────────

interface Section {
  label: string;
  title: string;
  titleAccent: string;
  description: ReactNode;
  chart: string;
  bg: string;
}

const sections: Section[] = [
  {
    label: 'System Overview',
    title: 'End-to-end',
    titleAccent: 'architecture.',
    description: <>A complete voice AI pipeline, from your browser to the phone and back. The frontend creates a task, the backend orchestrates the call through <HL>Twilio</HL>, processes speech with <HL>Deepgram</HL>, generates responses via the LLM, and streams everything back in real time.</>,
    chart: endToEndChart,
    bg: 'bg-white',
  },
  {
    label: 'LLM Providers',
    title: 'Multi-provider',
    titleAccent: 'LLM support.',
    description: <>Switch between OpenAI, Anthropic, or a fully local setup with a single environment variable. In production, kiru runs on a <HL>local Asus ROG GX10 workstation</HL> with <HL>Ollama serving qwen3:30b-a3b</HL> for zero API costs and full privacy.</>,
    chart: llmProviderChart,
    bg: 'bg-gray-50/60',
  },
  {
    label: 'Call Lifecycle',
    title: 'State machine',
    titleAccent: 'call flow.',
    description: <>Every call moves through well-defined states. After the call ends, <HL>automatic post-call analysis</HL> scores the negotiation, extracts tactics used, and generates a summary, all persisted for the history view.</>,
    chart: callLifecycleChart,
    bg: 'bg-white',
  },
  {
    label: 'Audio Pipeline',
    title: 'Real-time',
    titleAccent: 'audio processing.',
    description: <>Twilio streams raw <HL>mulaw audio over a WebSocket</HL>. The orchestrator pipes it to Deepgram for speech-to-text, feeds transcripts to the LLM, converts responses to speech, and sends audio back, all in under a second of latency.</>,
    chart: audioPipelineChart,
    bg: 'bg-gray-50/60',
  },
  {
    label: 'Negotiation Engine',
    title: 'Adaptive',
    titleAccent: 'strategy.',
    description: <>The negotiation engine selects a phase based on <HL>turn count</HL>: opening, discovery, proposal, or closing. Each phase uses different tactics and tone. Post-call, the full conversation is analyzed and scored.</>,
    chart: negotiationEngineChart,
    bg: 'bg-white',
  },
  {
    label: 'Frontend Updates',
    title: 'Live',
    titleAccent: 'WebSocket events.',
    description: <>The browser subscribes to a <HL>WebSocket channel</HL> for the active call. Every transcript update, agent thinking state, status change, and analysis result is pushed in real time. No polling, no delays.</>,
    chart: frontendRealtimeChart,
    bg: 'bg-gray-50/60',
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ─────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-3">
        <nav className="w-full max-w-5xl rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-soft">
          <div className="flex items-center justify-between px-6 h-14">
            <Link href="/" className="tracking-tight text-gray-950">
              <span className="font-serif italic text-[28px]">kiru</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/how-it-works" className="hidden sm:block text-[13px] text-gray-900 font-medium transition">How it works</Link>
              <Link href="/#features" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">Features</Link>
              <Link href="/dashboard" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">Dashboard</Link>
              <Link href="/chat" className="group inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-gray-800">
                Launch App <ArrowUpRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </nav>
      </div>

      {/* ── Hero ─────────────────────────────────── */}
      <section className="px-6 pt-24 sm:pt-32 pb-16">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Architecture</p>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[-0.04em] leading-[1.08] text-gray-950 max-w-2xl">
              How <Kiru className="text-gray-950" />{' '}
              <span className="font-serif italic font-normal">works.</span>
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-gray-500 max-w-xl">
              A deep dive into the system architecture, from the browser to the phone call and back. Six diagrams covering every layer of the stack.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Diagram sections ─────────────────────── */}
      {sections.map((section) => (
        <section key={section.label} className={`px-6 py-20 sm:py-28 ${section.bg}`}>
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">{section.label}</p>
              <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950 max-w-lg">
                {section.title}{' '}
                <span className="font-serif italic font-normal">{section.titleAccent}</span>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-gray-500 max-w-2xl">
                {section.description}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-10">
                <MermaidDiagram chart={section.chart} />
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      {/* ── Bottom CTA ───────────────────────────── */}
      <section className="px-6 py-20 sm:py-28 bg-gray-50/60">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950">
              Ready to{' '}<span className="font-serif italic font-normal">try it?</span>
            </h2>
            <p className="mt-4 text-[15px] text-gray-500 max-w-md mx-auto leading-relaxed">
              Start a negotiation and see the full pipeline in action.
            </p>
            <div className="mt-8 flex items-center gap-3 justify-center">
              <Link href="/chat" className="group inline-flex items-center gap-2 rounded-full bg-gray-950 pl-5 pr-4 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-gray-800 hover:shadow-card active:scale-[0.98]">
                Start negotiating <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/" className="inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-[14px] font-medium text-gray-500 transition hover:text-gray-900">
                Back to home
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
