'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { Kiru } from './shared';

// ── Animated hero chat mockup ─────────────────────────────────────────────────

type PreviewMsg = { role: 'user' | 'ai' | 'status'; text: string };

const script: PreviewMsg[] = [
  { role: 'ai', text: 'What would you like me to negotiate?' },
  { role: 'user', text: "My Comcast bill is $120/mo. Get it lower." },
  { role: 'ai', text: "On it. Calling Comcast retention now." },
  { role: 'status', text: 'Connected — retention dept' },
  { role: 'ai', text: "Locked in $85/mo for 12 months. You're saving $420/year." },
];

export default function ChatMockup() {
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
    <div
      className="relative w-full min-h-[458px] rounded-2xl flex items-center justify-center overflow-hidden"
      style={{
        backgroundImage: "url('/bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Soft ambient glow over wallpaper */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-100/20 via-rose-50/10 to-amber-50/10 pointer-events-none" />
      <div className="rounded-2xl border border-gray-200/60 bg-white/90 backdrop-blur-sm shadow-elevated overflow-hidden relative w-[520px] shrink-0">
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
          {typing ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="rounded-[18px] rounded-tl-md bg-gray-100 px-4 py-2.5 flex items-center gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-[5px] w-[5px] rounded-full bg-gray-400 animate-bounce-dot" style={{ animationDelay: `${i * 0.16}s` }} />
                ))}
              </div>
            </motion.div>
          ) : null}
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
