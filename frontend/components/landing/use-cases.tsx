'use client';

import { ArrowRight, Phone, CreditCard, FileText, TrendingDown } from 'lucide-react';
import { Kiru, Reveal } from './shared';

// ── Use Cases ───────────────────────────────────────────────────────────────────

export default function UseCases() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-12 lg:grid-cols-5 lg:gap-16 items-start">
          <Reveal className="lg:col-span-2">
            <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">Use cases</p>
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.03em] text-gray-950">
              Bills. Contracts.{' '}<span className="font-serif italic font-normal">Subscriptions.</span>
            </h2>
            <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">If there&apos;s a phone number and a better deal to be had, <Kiru className="text-gray-700" /> will find it.</p>
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
  );
}
