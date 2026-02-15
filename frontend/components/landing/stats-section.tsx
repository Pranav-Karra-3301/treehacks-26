'use client';

import { useEffect, useState, useRef } from 'react';
import { useInView } from 'framer-motion';
import { Reveal } from './shared';

// ── Animated counter ───────────────────────────────────────────────────────────

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

// ── Stats bar section ─────────────────────────────────────────────────────────

export default function StatsSection() {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-0 sm:divide-x divide-gray-100">
          {[
            { end: 8, prefix: '$', suffix: 'K+', label: 'Potential value saved', display: '$8K+' },
            { end: 300, prefix: '', suffix: '+', label: 'Calls' },
            { end: 83, prefix: '', suffix: '%', label: 'Success' },
          ].map((s) => (
            <Reveal key={s.label} className="text-center sm:px-4">
              <p className="text-[clamp(1.5rem,3.5vw,2.5rem)] font-bold tracking-tight text-gray-950 tabular-nums">
                {s.display ? s.display : <Counter end={s.end} prefix={s.prefix} suffix={s.suffix} />}
              </p>
              <p className="mt-1 text-[13px] text-gray-400 font-medium">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
