'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import MermaidDiagram from '@/components/mermaid-diagram';

// ─── Branded wordmark ──────────────────────────────────────────────────────────

function Kiru({ className = '' }: { className?: string }) {
  return <span className={`font-serif italic ${className}`}>kiru</span>;
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

// ─── Diagram definitions ───────────────────────────────────────────────────────

const endToEndChart = `
graph LR
  User([User]) --> Frontend[Next.js Frontend]
  Frontend -->|REST API| Backend[FastAPI Backend]
  Backend -->|Place Call| Twilio[Twilio]
  Twilio -->|Phone Call| Phone([Recipient])
  Phone -->|Audio Stream| Twilio
  Twilio -->|Media Stream WS| Backend
  Backend -->|STT| Deepgram[Deepgram STT]
  Deepgram -->|Transcript| Backend
  Backend -->|Prompt| LLM[LLM Provider]
  LLM -->|Response Stream| Backend
  Backend -->|TTS| TTS[Text-to-Speech]
  TTS -->|Audio| Backend
  Backend -->|Audio Out| Twilio
  Backend -->|WebSocket Events| Frontend
`;

const llmProviderChart = `
graph TD
  Config[LLM_PROVIDER env var] --> OpenAI
  Config --> Anthropic
  Config --> Local

  OpenAI[OpenAI API<br/>gpt-4o-mini]
  Anthropic[Anthropic API<br/>Claude Sonnet]
  Local[Local Ollama<br/>Asus ROG GX10<br/>qwen3:30b-a3b]

  OpenAI --> Stream[Async Streaming Response]
  Anthropic --> Stream
  Local --> Stream

  style Local fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d
`;

const callLifecycleChart = `
stateDiagram-v2
  [*] --> pending: Task Created
  pending --> dialing: Start Call
  dialing --> active: Connected
  active --> ended: Hang Up / Complete
  ended --> analyzing: Auto-Analysis
  analyzing --> complete: Analysis Saved
  complete --> [*]
`;

const audioPipelineChart = `
sequenceDiagram
  participant Phone as Phone (Recipient)
  participant Twilio as Twilio
  participant WS as Media Stream WS
  participant Orch as Orchestrator
  participant DG as Deepgram STT
  participant LLM as LLM Provider
  participant TTS as TTS Engine

  Phone->>Twilio: Voice Audio
  Twilio->>WS: mulaw Audio Chunks
  WS->>Orch: Inbound Audio Buffer
  Orch->>DG: Audio Stream
  DG-->>Orch: Transcript (interim + final)
  Orch->>LLM: User Utterance + Context
  LLM-->>Orch: Streamed Response
  Orch->>TTS: Response Text
  TTS-->>Orch: Audio Bytes
  Orch->>WS: Outbound Audio
  WS->>Twilio: mulaw Audio
  Twilio->>Phone: Voice Audio
  Orch-->>Orch: Save WAV Chunks + Transcript
`;

const negotiationEngineChart = `
graph TD
  Input[User Utterance] --> TurnCount{Turn Count}
  TurnCount -->|1-3| Opening[Opening Phase<br/>Build rapport, state objective]
  TurnCount -->|4-8| Discovery[Discovery Phase<br/>Gather info, find leverage]
  TurnCount -->|9-14| Proposal[Proposal Phase<br/>Make offers, counter-offer]
  TurnCount -->|15+| Closing[Closing Phase<br/>Finalize deal, confirm terms]

  Opening --> SysPrompt[Dynamic System Prompt]
  Discovery --> SysPrompt
  Proposal --> SysPrompt
  Closing --> SysPrompt

  SysPrompt --> LLMStream[LLM Streaming Response]
  LLMStream --> Transcript[Save to Transcript]
  LLMStream --> WSBroadcast[WebSocket Broadcast]
  LLMStream --> AudioOut[TTS Audio Output]

  Transcript --> PostCall{Call Ended?}
  PostCall -->|Yes| Analysis[Post-Call Analysis<br/>Score, tactics, summary]
  Analysis --> Storage[Save analysis.json]
`;

const frontendRealtimeChart = `
sequenceDiagram
  participant Browser as Browser
  participant Next as Next.js App
  participant WS as WebSocket /ws/call/:id
  participant Orch as Orchestrator

  Browser->>Next: Navigate to /call/:id
  Next->>WS: Connect WebSocket
  WS->>Orch: Subscribe to session

  Orch-->>WS: call_status: active
  WS-->>Next: Update status badge

  Orch-->>WS: transcript_update
  WS-->>Next: Append to transcript

  Orch-->>WS: agent_thinking
  WS-->>Next: Show thinking indicator

  Orch-->>WS: transcript_update (agent)
  WS-->>Next: Append agent response

  Browser->>Next: Click End Call
  Next->>Orch: POST /tasks/:id/call/stop

  Orch-->>WS: call_status: ended
  Orch-->>WS: analysis_ready
  WS-->>Next: Show analysis card
`;

// ─── Section data ──────────────────────────────────────────────────────────────

const sections = [
  {
    label: 'System Overview',
    title: 'End-to-end',
    titleAccent: 'architecture.',
    description: 'A complete voice AI pipeline — from your browser to the phone and back. The frontend creates a task, the backend orchestrates the call through Twilio, processes speech with Deepgram, generates responses with the LLM, and streams everything back in real time.',
    chart: endToEndChart,
    bg: 'bg-white',
  },
  {
    label: 'LLM Providers',
    title: 'Multi-provider',
    titleAccent: 'LLM support.',
    description: 'Switch between OpenAI, Anthropic, or a fully local setup with a single environment variable. In production, kiru runs on a local Asus ROG GX10 workstation with Ollama serving qwen3:30b-a3b — zero API costs, full privacy.',
    chart: llmProviderChart,
    bg: 'bg-gray-50/60',
  },
  {
    label: 'Call Lifecycle',
    title: 'State machine',
    titleAccent: 'call flow.',
    description: 'Every call moves through well-defined states. After the call ends, automatic post-call analysis scores the negotiation, extracts tactics used, and generates a summary — all persisted for the history view.',
    chart: callLifecycleChart,
    bg: 'bg-white',
  },
  {
    label: 'Audio Pipeline',
    title: 'Real-time',
    titleAccent: 'audio processing.',
    description: "Twilio streams raw mulaw audio over a WebSocket. The orchestrator pipes it to Deepgram for speech-to-text, feeds transcripts to the LLM, converts responses to speech, and sends audio back — all in under a second of latency.",
    chart: audioPipelineChart,
    bg: 'bg-gray-50/60',
  },
  {
    label: 'Negotiation Engine',
    title: 'Adaptive',
    titleAccent: 'strategy.',
    description: 'The negotiation engine selects a phase based on turn count — opening, discovery, proposal, or closing — and builds a dynamic system prompt. Each phase uses different tactics and tone. Post-call, the full conversation is analyzed and scored.',
    chart: negotiationEngineChart,
    bg: 'bg-white',
  },
  {
    label: 'Frontend Updates',
    title: 'Live',
    titleAccent: 'WebSocket events.',
    description: 'The browser subscribes to a WebSocket channel for the active call. Every transcript update, agent thinking state, status change, and analysis result is pushed in real time — no polling, no delays.',
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
              A deep dive into the system architecture — from the browser to the phone call and back. Six diagrams covering every layer of the stack.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Diagram sections ─────────────────────── */}
      {sections.map((section, i) => (
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
                <MermaidDiagram chart={section.chart} theme="zinc-light" />
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
