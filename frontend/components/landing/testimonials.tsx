'use client';

import { Reveal } from './shared';

// ── Testimonials ──────────────────────────────────────────────────────────────

export default function Testimonials() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-[13px] font-medium text-gray-400 tracking-wide uppercase mb-3">What people are saying</p>
        </Reveal>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {/* Featured testimonial -- large */}
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
  );
}
