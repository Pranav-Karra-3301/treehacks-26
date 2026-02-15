'use client';

import Link from 'next/link';
import { useRef, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Kiru, Reveal } from '../components/landing/shared';

// ── Dynamic imports for below-fold sections ─────────────────────────────────

const ChatMockup = dynamic(() => import('../components/landing/chat-mockup'), { ssr: true });
const StatsSection = dynamic(() => import('../components/landing/stats-section'), { ssr: true });
const CategoryMarquee = dynamic(() => import('../components/landing/category-marquee'), { ssr: true });
const FeaturesBento = dynamic(() => import('../components/landing/features-bento'), { ssr: true });
const UseCases = dynamic(() => import('../components/landing/use-cases'), { ssr: true });
const CtaFooter = dynamic(() => import('../components/landing/cta-footer'), { ssr: true });

// ── Hero orb (video, ping-pong: forward then backward) ─────────────────────────

// Throttled reverse: seek at ~30fps with fixed step so decode aligns to frames and we don't stutter
const REVERSE_FPS = 30;
const REVERSE_STEP = 1 / REVERSE_FPS;
const REVERSE_INTERVAL_MS = 1000 / REVERSE_FPS;

function HeroOrb() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playForward = () => video.play();

    const runReverse = () => {
      let lastSeekAt = performance.now();
      const tick = (now: number) => {
        if (video.currentTime <= 0.001) {
          video.currentTime = 0;
          rafRef.current = null;
          playForward();
          return;
        }
        const elapsed = now - lastSeekAt;
        if (elapsed >= REVERSE_INTERVAL_MS) {
          lastSeekAt = now;
          video.currentTime = Math.max(0, video.currentTime - REVERSE_STEP);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const onEnded = () => runReverse();

    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('ended', onEnded);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex justify-center items-center w-full max-w-[320px] aspect-square mx-auto lg:mx-0 lg:max-w-none lg:w-[clamp(260px,28vw,320px)]"
    >
      <video
        ref={videoRef}
        src="/orb.mp4"
        autoPlay
        loop={false}
        muted
        playsInline
        className="w-full h-full object-contain rounded-full"
        aria-hidden
      />
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -60]);

  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ─────────────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-3">
        <nav className="w-full max-w-5xl rounded-2xl flex items-center justify-between px-6 h-14 bg-white/95 backdrop-blur-sm border border-gray-200/60">
          <Link href="/" className="tracking-tight text-gray-950">
            <span className="font-serif italic text-[28px]">kiru</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/how-it-works" className="hidden sm:block text-[13px] font-medium text-gray-500 transition hover:text-gray-900">
              How it works
            </Link>
            <a href="#features" className="hidden sm:block text-[13px] font-medium text-gray-500 transition hover:text-gray-900">
              Features
            </a>
            <Link href="/dashboard" className="hidden sm:block text-[13px] font-medium text-gray-500 transition hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/chat" className="group inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-gray-800">
              Launch App <ArrowUpRight size={12} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
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
            <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
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
                Never sit on hold{' '}
                <span className="font-serif italic font-normal">again.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="mt-5 text-[17px] leading-relaxed text-gray-500 max-w-md mx-auto lg:mx-0"
              >
                <Kiru className="text-gray-700" /> is an AI voice agent that calls businesses, negotiates on your behalf, and gets you better deals — in minutes, not hours.
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

            {/* Animated orb -- right side on desktop */}
            <div className="mt-14 lg:mt-0 flex justify-center lg:justify-end">
              <HeroOrb />
            </div>
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
      <CategoryMarquee />

      {/* ── Stats bar ───────────────────────────── */}
      <StatsSection />

      {/* ── Chat mockup showcase ────────────── */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl flex justify-center">
          <Reveal className="w-full">
            <ChatMockup />
          </Reveal>
        </div>
      </section>

      {/* ── Bento Feature Grid ──────────────────── */}
      <FeaturesBento />

      {/* ── Use Cases ───────────────────────────── */}
      <UseCases />

      {/* ── Smooth transition + Bottom CTA + Footer ── */}
      <CtaFooter />
    </div>
  );
}
