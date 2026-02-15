'use client';

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Phone, Mic, BarChart3, Shield, TrendingDown, FileText, CreditCard, Check, ChevronRight } from 'lucide-react';

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

// ─── Animated counter ───────────────────────────────────────────────────────────

function Counter({ end, prefix = '', suffix = '', duration = 2000 }: { end: number; prefix?: string; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

// ─── Animated hero chat mockup ─────────────────────────────────────────────────

type PreviewMsg = { role: 'user' | 'ai' | 'status'; text: string };

const script: PreviewMsg[] = [
  { role: 'ai', text: 'What would you like me to negotiate?' },
  { role: 'user', text: "Lower my Comcast bill. I'm paying $120/mo, been a customer for 5 years." },
  { role: 'ai', text: "Calling Comcast now. I'll negotiate a lower rate for you." },
  { role: 'status', text: 'Connected — retention dept' },
  { role: 'ai', text: "Done. Your new rate is $85/mo — that's $420/year saved." },
];

function ChatMockup() {
  const [messages, setMessages] = useState<PreviewMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [cycle, setCycle] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setTyping(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 600;
    script.forEach((msg, i) => {
      if (msg.role === 'ai') { timers.push(setTimeout(() => setTyping(true), t)); t += 1000; }
      timers.push(setTimeout(() => { setTyping(false); setMessages((p) => [...p, msg]); }, t));
      t += i === script.length - 1 ? 3000 : 1500;
    });
    timers.push(setTimeout(() => setCycle((c) => c + 1), t));
    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages, typing]);

  return (
    <div className="relative w-full min-w-[520px] max-w-[520px]">
      {/* Soft ambient glow */}
      <div className="absolute -inset-16 bg-gradient-to-br from-violet-100/40 via-rose-50/30 to-amber-50/30 rounded-[80px] blur-3xl -z-10" />
      <div className="rounded-2xl border border-gray-200/60 bg-white/90 backdrop-blur-sm shadow-elevated overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-[9px] w-[9px] rounded-full bg-[#FF5F57]" />
            <span className="h-[9px] w-[9px] rounded-full bg-[#FEBC2E]" />
            <span className="h-[9px] w-[9px] rounded-full bg-[#28C840]" />
          </div>
          <div className="flex-1 flex justify-center"><Kiru className="text-[12px] text-gray-400" /></div>
          <div className="w-[42px]" />
        </div>
        {/* Messages */}
        <div ref={ref} className="h-[260px] overflow-y-auto px-4 py-4 space-y-2.5">
          {messages.map((msg, i) => (
            <motion.div key={`${cycle}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {msg.role === 'status' ? (
                <div className="flex justify-center py-1"><span className="text-[11px] text-emerald-600 font-medium bg-emerald-50 rounded-full px-3 py-0.5">{msg.text}</span></div>
              ) : msg.role === 'user' ? (
                <div className="flex justify-end"><div className="max-w-[78%] rounded-[18px] rounded-tr-md bg-gray-900 px-3.5 py-2 text-[13px] leading-[1.45] text-white">{msg.text}</div></div>
              ) : (
                <div className="flex justify-start"><div className="max-w-[78%] rounded-[18px] rounded-tl-md bg-gray-100 px-3.5 py-2 text-[13px] leading-[1.45] text-gray-900">{msg.text}</div></div>
              )}
            </motion.div>
          ))}
          {typing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="rounded-[18px] rounded-tl-md bg-gray-100 px-4 py-2.5 flex items-center gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-[5px] w-[5px] rounded-full bg-gray-400 animate-bounce-dot" style={{ animationDelay: `${i * 0.16}s` }} />
                ))}
              </div>
            </motion.div>
          )}
        </div>
        {/* Input */}
        <div className="border-t border-gray-100 px-4 py-2.5">
          <div className="flex items-center rounded-xl bg-gray-50 px-3 py-2">
            <span className="flex-1 text-[12px] text-gray-300">Message kiru...</span>
            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center"><ArrowUpRight size={11} className="text-gray-400" /></div>
          </div>
        </div>
      </div>
    </div>
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

// ─── Bento visuals ─────────────────────────────────────────────────────────────

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
    <div className="mt-6 space-y-2 text-[12px] font-mono">
      {[
        { who: 'Agent', line: "I've been a loyal customer for five years and I'd like to discuss my rate." },
        { who: 'Rep', line: 'Let me pull up your account and see what options we have.' },
        { who: 'Agent', line: "I've seen competitors offering $79/mo for the same speed..." },
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
          {i < steps.length - 1 && <div className="h-px flex-1 bg-gray-200 mx-2 min-w-[16px]" />}
        </div>
      ))}
    </div>
  );
}

// ─── Categories marquee ─────────────────────────────────────────────────────────

const categories = ['Car Deals', 'Home Loans', 'Insurance', 'Medical Bills', 'Refunds', 'Returns', 'Subscriptions', 'Cable Bills', 'Phone Plans', 'Rent', 'Hotel Rates', 'Bank Fees', 'Internet Plans', 'Gym Memberships', 'Warranties', 'Credit Cards'];

function CategoryMarquee() {
  return (
    <div className="mx-auto max-w-5xl relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10" />
      <div className="flex animate-marquee w-max">
        {[...categories, ...categories, ...categories, ...categories].map((name, i) => (
          <span key={i} className="shrink-0 px-5 text-[14px] font-medium text-gray-300 tracking-wide whitespace-nowrap">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -60]);

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
              <Link href="/how-it-works" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">How it works</Link>
              <a href="#features" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">Features</a>
              <Link href="/dashboard" className="hidden sm:block text-[13px] text-gray-500 transition hover:text-gray-900">Dashboard</Link>
              <Link href="/chat" className="group inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-gray-800">
                Launch App <ArrowUpRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </nav>
      </div>

      {/* ── Hero ────────────────────────────────── */}
      <section ref={heroRef} className="relative overflow-hidden">
        {/* Dot grid bg */}
        <div className="absolute inset-0 dot-grid opacity-40" />
        {/* Radial fade */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,white_70%)]" />

        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="relative px-6 pt-24 sm:pt-32 pb-8">
          <div className="mx-auto max-w-5xl">
            <div className="max-w-xl mx-auto text-center lg:text-left lg:mx-0">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] font-medium text-gray-500 mb-6 shadow-soft"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Now in public beta
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="text-[clamp(2.75rem,6.5vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.04em] text-gray-950"
              >
                Your AI makes{' '}
                <span className="font-serif italic font-normal">the call.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="mt-5 text-[17px] leading-relaxed text-gray-500 max-w-md mx-auto lg:mx-0"
              >
                Tell <Kiru className="text-gray-700" /> what you want. It calls, negotiates in real-time, and saves you money — while you do literally anything else.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 flex items-center gap-3 justify-center lg:justify-start"
              >
                <Link href="/chat" className="group inline-flex items-center gap-2 rounded-full bg-gray-950 pl-5 pr-4 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-gray-800 hover:shadow-card active:scale-[0.98]">
                  Start negotiating <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="/how-it-works" className="inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-[14px] font-medium text-gray-500 transition hover:text-gray-900">
                  See how it works <ChevronRight size={14} />
                </Link>
              </motion.div>
            </div>

            {/* YouTube demo video */}
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mt-12"
            >
              <div className="rounded-2xl overflow-hidden border border-gray-200/60 shadow-card aspect-video">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
                  title="Kiru Demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Category marquee ─────────────────── */}
      <Reveal className="py-10 border-t border-gray-100/60">
        <p className="text-center text-[12px] font-medium text-gray-400 tracking-wide uppercase mb-5">
          Negotiate anything
        </p>
        <CategoryMarquee />
      </Reveal>

      {/* ── Stats bar ───────────────────────────── */}
      <section className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {[
              { end: 2400000, prefix: '$', suffix: '+', label: 'Saved for users', display: '$2.4M+' },
              { end: 12000, prefix: '', suffix: '+', label: 'Calls completed' },
              { end: 94, prefix: '', suffix: '%', label: 'Success rate' },
            ].map((s) => (
              <Reveal key={s.label} className="text-center px-4">
                <p className="text-[clamp(1.5rem,3.5vw,2.5rem)] font-bold tracking-tight text-gray-950 tabular-nums">
                  {s.display ? s.display : <Counter end={s.end} prefix={s.prefix} suffix={s.suffix} />}
                </p>
                <p className="mt-1 text-[13px] text-gray-400 font-medium">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Chat mockup showcase ────────────── */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl flex justify-center">
          <Reveal>
            <ChatMockup />
          </Reveal>
        </div>
      </section>

      {/* ── Bento Feature Grid ──────────────────── */}
      <section id="features" className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Capabilities</p>
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950 max-w-lg">
              Everything happens in{' '}
              <span className="font-serif italic font-normal">one call.</span>
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Reveal delay={0.05} className="sm:col-span-2 lg:col-span-2">
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M5.72284 3C4.24801 3 2.92738 4.20552 3.09672 5.79624C3.34796 8.15623 4.09035 10.4576 5.28656 12.5194C6.77526 15.0853 8.91559 17.2256 11.4815 18.7143C13.5573 19.9187 15.8298 20.627 18.1723 20.8864C19.7705 21.0633 21.0009 19.743 21.0009 18.25V16.4965C21.0009 15.2766 20.1972 14.2024 19.0269 13.8582L17.3448 13.3635C16.3805 13.0799 15.3386 13.3569 14.6425 14.082C14.2662 14.474 13.7294 14.5345 13.3582 14.2944C11.8978 13.35 10.6509 12.1031 9.70649 10.6427C9.46639 10.2715 9.52689 9.73471 9.91892 9.35836C10.644 8.66231 10.921 7.62038 10.6374 6.65615L10.1427 4.97404C9.79845 3.80369 8.72434 3 7.50442 3H5.72284Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Real Calls</span></div>
                <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Not a chatbot. An actual phone call.</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500 max-w-md">
                  <Kiru className="text-gray-700" /> dials the number, navigates phone trees, waits on hold, and speaks to a real person — all while you do something else.
                </p>
                <BentoCallVisual />
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M20.25 3C20.6642 3 21 3.33579 21 3.75V9.25C21 9.66421 20.6642 10 20.25 10C19.8358 10 19.5 9.66421 19.5 9.25V5.56055L13.0605 12L19.5 18.4395V14.75C19.5 14.3358 19.8358 14 20.25 14C20.6642 14 21 14.3358 21 14.75V20.25C21 20.6642 20.6642 21 20.25 21H14.75C14.3358 21 14 20.6642 14 20.25C14 19.8358 14.3358 19.5 14.75 19.5H18.4395L11.6895 12.75H3.75C3.33579 12.75 3 12.4142 3 12C3 11.5858 3.33579 11.25 3.75 11.25H11.6895L18.4395 4.5H14.75C14.3358 4.5 14 4.16421 14 3.75C14 3.33579 14.3358 3 14.75 3H20.25Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Strategy</span></div>
                <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Adapts mid-conversation</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Selects and shifts tactics in real-time based on what&apos;s working.</p>
                <BentoTacticsVisual />
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-1"><BarChart3 size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Analysis</span></div>
                <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Scored and summarized</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Every negotiation gets a performance score with a detailed breakdown.</p>
                <BentoScoreVisual />
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-1"><Shield size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Privacy</span></div>
                <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Your data stays yours</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Calls are processed securely. No training on your conversations. Delete anytime.</p>
                <BentoPrivacyVisual />
              </div>
            </Reveal>
            <Reveal delay={0.25}>
              <div className="group h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card hover:bg-white">
                <div className="flex items-center gap-2 mb-1"><Mic size={14} className="text-gray-400" /><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Transcript</span></div>
                <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Every word recorded</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">Full transcript and audio recording of every negotiation.</p>
                <BentoTranscriptVisual />
              </div>
            </Reveal>
            <Reveal delay={0.3} className="sm:col-span-2 lg:col-span-3">
              <div className="group rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50/80 via-white to-gray-50/50 p-6 sm:p-8 transition-all duration-200 hover:border-gray-200 hover:shadow-card">
                <div className="lg:flex lg:items-center lg:justify-between lg:gap-12">
                  <div className="lg:max-w-md">
                    <div className="flex items-center gap-2 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width={14} height={14} className="text-gray-400"><path d="M3.38184 13.2568C3.79229 13.3115 4.08083 13.6882 4.02637 14.0986C4.00894 14.2295 4 14.3637 4 14.5C4 15.9621 5.04614 17.1793 6.43066 17.4453V16.4512C6.43066 15.9421 7.04627 15.6869 7.40625 16.0469L9.45508 18.0957C9.67824 18.3189 9.67824 18.6811 9.45508 18.9043L7.40625 20.9531C7.04625 21.3129 6.43066 21.0579 6.43066 20.5488V18.9619C4.21432 18.6819 2.5 16.7923 2.5 14.5C2.5 14.2974 2.51391 14.0976 2.54004 13.9014C2.59473 13.4909 2.97134 13.2023 3.38184 13.2568Z" fill="currentColor"/><path d="M17.25 3C17.6642 3 18 3.33579 18 3.75V15.75C18 16.1642 17.6642 16.5 17.25 16.5C16.8358 16.5 16.5 16.1642 16.5 15.75V3.75C16.5 3.33579 16.8358 3 17.25 3Z" fill="currentColor"/><path d="M6.59375 8.47559C6.95373 8.11561 7.56934 8.37079 7.56934 8.87988V10.0371C9.78574 10.317 11.5 12.2076 11.5 14.5C11.5 14.7026 11.4861 14.9024 11.46 15.0986C11.4053 15.5091 11.0287 15.7977 10.6182 15.7432C10.2077 15.6885 9.91917 15.3118 9.97363 14.9014C9.99106 14.7705 10 14.6363 10 14.5C10 13.0378 8.95395 11.8197 7.56934 11.5537V12.9775C7.56934 13.4866 6.95375 13.7416 6.59375 13.3818L4.54492 11.333C4.32177 11.1099 4.32177 10.7476 4.54492 10.5244L6.59375 8.47559Z" fill="currentColor"/><path d="M13.75 6C14.1642 6 14.5 6.33579 14.5 6.75V10.75C14.5 11.1642 14.1642 11.5 13.75 11.5C13.3358 11.5 13 11.1642 13 10.75V6.75C13 6.33579 13.3358 6 13.75 6Z" fill="currentColor"/><path d="M20.75 8C21.1642 8 21.5 8.33579 21.5 8.75V10.75C21.5 11.1642 21.1642 11.5 20.75 11.5C20.3358 11.5 20 11.1642 20 10.75V8.75C20 8.33579 20.3358 8 20.75 8Z" fill="currentColor"/><path d="M10.25 4C10.6642 4 11 4.33579 11 4.75V7.25C11 7.66421 10.6642 8 10.25 8C9.83579 8 9.5 7.66421 9.5 7.25V4.75C9.5 4.33579 9.83579 4 10.25 4Z" fill="currentColor"/></svg><span className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Automation</span></div>
                    <h3 className="text-[18px] font-semibold text-gray-950 mt-2">Handles hold times, phone trees, and transfers</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-gray-500">No more pressing 1 for English, waiting 45 minutes, or being transferred three times. <Kiru className="text-gray-700" /> does the tedious parts so you don&apos;t have to.</p>
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

      {/* ── Use Cases ───────────────────────────── */}
      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-5 lg:gap-16 items-start">
            <Reveal className="lg:col-span-2">
              <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Use cases</p>
              <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950">
                Bills. Contracts.{' '}<span className="font-serif italic font-normal">Subscriptions.</span>
              </h2>
              <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">Whatever you&apos;re overpaying for, <Kiru className="text-gray-700" /> can negotiate it down. Here&apos;s what our users have saved.</p>
            </Reveal>

            <Reveal delay={0.1} className="lg:col-span-3">
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                {[
                  { icon: CreditCard, title: 'Cable & Internet', before: '$120/mo', after: '$85/mo', saved: '$420/yr', desc: 'Comcast, Spectrum, AT&T — loyalty discounts they don\'t advertise.' },
                  { icon: FileText, title: 'Medical Bills', before: '$2,400', after: '$960', saved: '$1,440', desc: 'Hospital bills, lab fees, out-of-network charges.' },
                  { icon: TrendingDown, title: 'Subscriptions', before: '$89/mo', after: '$59/mo', saved: '$360/yr', desc: 'SaaS, insurance, memberships — cancel and renegotiate.' },
                  { icon: Phone, title: 'Phone & Wireless', before: '$95/mo', after: '$65/mo', saved: '$360/yr', desc: 'Carrier retention deals, plan downgrades, fee waivers.' },
                ].map((c, i) => (
                  <div key={c.title} className={`flex items-center gap-5 px-6 py-5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                      <c.icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-gray-950">{c.title}</h3>
                        <span className="text-[12px] text-gray-400">{c.desc}</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-[13px] text-gray-400 line-through">{c.before}</span>
                        <ArrowRight size={10} className="text-gray-300" />
                        <span className="text-[13px] font-semibold text-gray-950">{c.after}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[16px] font-bold text-emerald-600 tracking-tight">{c.saved}</span>
                      <p className="text-[11px] text-gray-400">saved</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────── */}
      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">What people are saying</p>
          </Reveal>

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            {/* Featured testimonial — large */}
            <Reveal delay={0.05} className="lg:col-span-3">
              <div className="h-full rounded-2xl border border-gray-100 bg-gray-50/50 p-8 sm:p-10 flex flex-col justify-between">
                <p className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-serif italic leading-[1.4] text-gray-900">
                  &ldquo;I saved $420 a year on my internet bill while eating lunch. The whole thing took three minutes on my end.&rdquo;
                </p>
                <div className="mt-8 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-[13px] font-semibold text-gray-500">SK</div>
                  <div>
                    <p className="text-[14px] font-semibold text-gray-950">Sarah K.</p>
                    <p className="text-[12px] text-emerald-600 font-medium">Comcast &mdash; $35/mo saved</p>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Two stacked smaller testimonials */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Reveal delay={0.12}>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
                  <p className="text-[14px] leading-relaxed text-gray-700">&ldquo;I had a $2,400 ER bill I thought was non-negotiable. Kiru got it down to $960.&rdquo;</p>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-500">MT</div>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-950">Marcus T.</p>
                      <p className="text-[11px] text-emerald-600 font-medium">Medical &mdash; $1,440 saved</p>
                    </div>
                  </div>
                </div>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
                  <p className="text-[14px] leading-relaxed text-gray-700">&ldquo;It called my insurance company, sat on hold for 40 minutes, and negotiated my premium down. I didn&apos;t do a thing.&rdquo;</p>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-500">PR</div>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-950">Priya R.</p>
                      <p className="text-[11px] text-emerald-600 font-medium">Insurance &mdash; $28/mo saved</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── Smooth white → dark transition ─────────── */}
      <div
        className="h-64 sm:h-96 -mb-px"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fefefe 8%, #f9f9fa 16%, #f0f0f2 24%, #dddde2 32%, #c4c4cc 40%, #9a9aa6 48%, #6e6e7a 56%, #4a4a54 64%, #2e2e36 72%, #1a1a22 80%, #101018 88%, #09090b 96%)',
        }}
      />

      {/* ── Bottom CTA + Gradient ─────────────────── */}
      <section className="relative px-6 pt-32 sm:pt-44 pb-0 overflow-hidden bg-gray-950 min-h-screen flex flex-col">

        {/* Animated aurora gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute bottom-0 left-[5%] h-[70%] w-[55%] translate-y-[40%] rounded-full bg-violet-600/30 blur-[120px] animate-aurora-drift" />
          <div className="absolute bottom-0 right-[0%] h-[65%] w-[50%] translate-y-[35%] rounded-full bg-blue-500/45 blur-[100px] animate-aurora-drift-2" />
          <div className="absolute bottom-0 left-[20%] h-[55%] w-[45%] translate-y-[25%] rounded-full bg-rose-500/30 blur-[100px] animate-aurora-drift" />
          <div className="absolute bottom-0 right-[10%] h-[75%] w-[50%] translate-y-[50%] rounded-full bg-indigo-600/40 blur-[140px] animate-aurora-drift-2" />
          <div className="absolute bottom-0 left-[40%] h-[50%] w-[35%] translate-y-[40%] rounded-full bg-fuchsia-500/25 blur-[90px] animate-aurora-drift" />
          <div className="absolute bottom-0 left-[-5%] h-[60%] w-[40%] translate-y-[55%] rounded-full bg-amber-500/20 blur-[120px] animate-aurora-drift-2" />
        </div>

        {/* Grain texture */}
        <div className="absolute inset-0 grain" />

        <Reveal>
          <div className="mx-auto max-w-5xl relative z-10">
            <h2 className="text-[clamp(2rem,5vw,3.75rem)] font-bold tracking-[-0.04em] leading-[1.08] text-white max-w-xl">
              Stop leaving money{' '}<br className="hidden sm:block" />
              <span className="font-serif italic font-normal">on the table.</span>
            </h2>
            <p className="mt-5 text-[16px] text-gray-400 max-w-md leading-relaxed">
              One message. One call. Real savings — delivered to you while you wait.
            </p>
            <div className="mt-10 flex items-center gap-4 pb-24">
              <Link href="/chat" className="group inline-flex items-center gap-2 rounded-full bg-white pl-6 pr-5 py-3 text-[14px] font-semibold text-gray-950 transition-all hover:bg-gray-100 hover:shadow-elevated active:scale-[0.98]">
                Start your first negotiation <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <span className="text-[13px] text-gray-500">No credit card required</span>
            </div>
          </div>
        </Reveal>

        {/* Flex spacer pushes footer to bottom */}
        <div className="flex-1" aria-hidden="true" />

        {/* ── Footer (seamless, inside CTA section) ─── */}
        <div className="relative z-10 pb-10">
          {/* Giant "kiru" with mix-blend-difference */}
          <div className="flex justify-center overflow-hidden pointer-events-none select-none mix-blend-difference">
            <span className="font-serif italic text-white text-[clamp(12rem,42vw,36rem)] leading-[0.82] tracking-[-0.04em]">
              kiru
            </span>
          </div>

          {/* Team + meta row */}
          <div className="mx-auto max-w-5xl mt-10 px-6">
            <div className="flex flex-col items-center gap-6">
              {/* Team */}
              <div className="flex items-center gap-2 text-[13px] text-white/50">
                <span>Built by</span>
                <a href="https://x.com/pranavkarra" target="_blank" rel="noopener noreferrer" className="text-white/80 font-medium hover:text-white transition">Pranav</a>
                <span>&middot;</span>
                <a href="https://x.com/_eth0n" target="_blank" rel="noopener noreferrer" className="text-white/80 font-medium hover:text-white transition">Ethan</a>
                <span>&middot;</span>
                <a href="https://www.linkedin.com/in/jayanthsidamsety/" target="_blank" rel="noopener noreferrer" className="text-white/80 font-medium hover:text-white transition">Jayanth</a>
              </div>
              {/* Links */}
              <div className="flex items-center gap-6">
                <Link href="/chat" className="text-[13px] text-white/60 transition hover:text-white">Launch App</Link>
                <span className="text-[12px] text-white/40">TreeHacks 2026</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
