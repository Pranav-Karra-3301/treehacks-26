'use client';

import { motion } from 'framer-motion';
import { Phone, ExternalLink, ArrowRight } from 'lucide-react';
import type { BusinessResult } from '../lib/types';

type Props = {
  results: BusinessResult[];
  onCall: (result: BusinessResult, phone: string) => void;
  onSkip: () => void;
};

export default function SearchResultCards({ results, onCall, onSkip }: Props) {
  const withPhone = results.filter((r) => r.phone_numbers.length > 0);
  const display = withPhone.length > 0 ? withPhone : results.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5">
        {display.map((result, i) => {
          const phone = result.phone_numbers[0] ?? null;
          return (
            <motion.div
              key={result.url ?? i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="group relative rounded-2xl border border-gray-150 bg-white px-4 py-3.5 shadow-soft transition-all hover:shadow-card hover:border-gray-250"
              style={{ borderColor: 'rgba(228,228,231,0.7)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[13.5px] font-semibold text-gray-900 leading-snug">
                      {result.title || 'Untitled'}
                    </h3>
                    {result.url && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {result.snippet && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500 line-clamp-2">
                      {result.snippet}
                    </p>
                  )}
                  {phone && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-gray-400">
                      <Phone size={10} className="text-gray-300" />
                      {phone}
                    </p>
                  )}
                </div>
                {phone && (
                  <button
                    onClick={() => onCall(result, phone)}
                    className="shrink-0 mt-0.5 flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-soft transition-all hover:bg-gray-700 hover:shadow-card active:scale-[0.97]"
                  >
                    <Phone size={11} />
                    Call
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: display.length * 0.06 + 0.1, duration: 0.3 }}
        onClick={onSkip}
        className="flex items-center gap-1.5 mx-auto text-[12px] text-gray-400 hover:text-gray-600 transition-colors py-1"
      >
        I have my own number
        <ArrowRight size={11} />
      </motion.button>
    </div>
  );
}
