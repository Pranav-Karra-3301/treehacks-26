'use client';

import { Reveal } from './shared';

// ── Categories marquee ─────────────────────────────────────────────────────────

const categories = ['Car Deals', 'Home Loans', 'Insurance', 'Medical Bills', 'Refunds', 'Returns', 'Subscriptions', 'Cable Bills', 'Phone Plans', 'Rent', 'Hotel Rates', 'Bank Fees', 'Internet Plans', 'Gym Memberships', 'Warranties', 'Credit Cards'];

function CategoryMarqueeInner() {
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

export default function CategoryMarquee() {
  return (
    <Reveal className="py-10 border-t border-gray-100/60 overflow-hidden">
      <p className="text-center text-[12px] font-medium text-gray-400 tracking-wide uppercase mb-5">
        Works with any company
      </p>
      <CategoryMarqueeInner />
    </Reveal>
  );
}
