'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Kiru, Reveal } from './shared';

// ── Bottom CTA + Footer aurora section ────────────────────────────────────────

export default function CtaFooter() {
  return (
    <>
      {/* Smooth white to dark transition */}
      <div
        className="h-64 sm:h-96 -mb-px"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #fefefe 8%, #f9f9fa 16%, #f0f0f2 24%, #dddde2 32%, #c4c4cc 40%, #9a9aa6 48%, #6e6e7a 56%, #4a4a54 64%, #2e2e36 72%, #1a1a22 80%, #101018 88%, #09090b 96%)',
        }}
      />

      {/* Bottom CTA + Gradient */}
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
              You&apos;re overpaying.{' '}<br className="hidden sm:block" />
              <span className="font-serif italic font-normal">Let&apos;s fix that.</span>
            </h2>
            <p className="mt-5 text-[16px] text-gray-400 max-w-md leading-relaxed">
              Type what you want. <Kiru className="text-white/70" /> handles the call, the negotiation, and the awkward silence. You just save money.
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

        {/* Footer (seamless, inside CTA section) */}
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
    </>
  );
}
