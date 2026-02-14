'use client';

import { motion } from 'framer-motion';
import { Phone, ArrowRight, Globe } from 'lucide-react';
import type { BusinessResult } from '../lib/types';

type Props = {
  results: BusinessResult[];
  onCall: (result: BusinessResult, phone: string) => void;
  onSkip: () => void;
};

/** Strip markdown artifacts, image refs, nav junk from Exa snippets. */
function cleanSnippet(raw: string): string {
  return raw
    .replace(/!\[.*?\]/g, '')          // ![alt] image refs
    .replace(/\[!\[.*?\]\]/g, '')      // [![nested]]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\[([^\]]*)\]/g, '$1')    // [text] → text
    .replace(/#{1,6}\s*/g, '')         // ## headings
    .replace(/\*{1,3}/g, '')           // bold/italic markers
    .replace(/\s{2,}/g, ' ')           // collapse whitespace
    .replace(/^[\s|*#\-]+/, '')        // leading junk
    .trim();
}

/** Format +1XXXXXXXXXX to (XXX) XXX-XXXX */
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

/** Extract domain from URL for display */
function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function SearchResultCards({ results, onCall, onSkip }: Props) {
  const withPhone = results.filter((r) => r.phone_numbers.length > 0);
  const display = (withPhone.length > 0 ? withPhone : results).slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        {display.map((result, i) => {
          const phone = result.phone_numbers[0] ?? null;
          const snippet = result.snippet ? cleanSnippet(result.snippet) : '';
          const domain = result.url ? displayDomain(result.url) : '';

          return (
            <motion.div
              key={result.url ?? i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease }}
              className="group flex items-center gap-3 rounded-xl bg-white border border-gray-100 pl-3.5 pr-2 py-2.5 transition-all duration-150 hover:border-gray-200 hover:shadow-soft"
            >
              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-gray-900">
                    {result.title || 'Untitled'}
                  </span>
                  {domain && (
                    <a
                      href={result.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-0.5 text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe size={9} />
                      <span className="hidden sm:inline">{domain}</span>
                    </a>
                  )}
                </div>
                {snippet && (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400 line-clamp-1">
                    {snippet}
                  </p>
                )}
                {phone && (
                  <p className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                    {formatPhone(phone)}
                  </p>
                )}
              </div>

              {/* Call button */}
              {phone && (
                <button
                  onClick={() => onCall(result, phone)}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-gray-900 pl-2.5 pr-3 py-1.5 text-[11.5px] font-medium text-white transition-all duration-150 hover:bg-gray-700 active:scale-[0.96]"
                >
                  <Phone size={10} strokeWidth={2.5} />
                  Call
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: display.length * 0.05 + 0.08, duration: 0.25 }}
        onClick={onSkip}
        className="flex items-center gap-1 mx-auto text-[11px] text-gray-400 hover:text-gray-600 transition-colors pt-0.5 pb-1"
      >
        I have my own number
        <ArrowRight size={10} />
      </motion.button>
    </div>
  );
}
