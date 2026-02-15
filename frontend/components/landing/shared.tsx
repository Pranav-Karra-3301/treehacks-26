'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

// ── Branded wordmark ──────────────────────────────────────────────────────────

export function Kiru({ className = '' }: { className?: string }) {
  return (
    <span
      className={`italic ${className}`}
      style={{ fontFamily: '"Martina Plantijn", Georgia, serif' }}
    >
      kiru
    </span>
  );
}

// ── Scroll reveal ─────────────────────────────────────────────────────────────

export function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }} className={className}>
      {children}
    </motion.div>
  );
}
